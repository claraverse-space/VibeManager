// telegram-client.js - Robust Telegram bot client with auto-reconnection
const { Telegraf, Markup } = require('telegraf');
const EventEmitter = require('events');
const https = require('https');
const dns = require('dns');

// Force IPv4 DNS resolution globally
dns.setDefaultResultOrder('ipv4first');

class TelegramClient extends EventEmitter {
  constructor(config, botService) {
    super();
    this.config = config;
    this.botService = botService;
    this.bot = null;
    this.ready = false;
    this.connecting = false;

    // Reconnection state
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = Infinity; // Never stop trying
    this.reconnectDelay = 1000; // Start with 1 second
    this.maxReconnectDelay = 60000; // Max 1 minute
    this.reconnectTimer = null;

    // Health monitoring
    this.lastHealthCheck = Date.now();
    this.healthCheckInterval = null;
    this.healthCheckTimeout = 30000; // 30 seconds

    // Connection state
    this.connectionState = 'disconnected'; // disconnected, connecting, connected, reconnecting
  }

  async connect() {
    if (this.connecting) {
      console.log('[Telegram] Already connecting, skipping...');
      return false;
    }

    if (!this.config.get('telegram.token')) {
      console.log('[Telegram] No token provided, skipping Telegram bot');
      this.connectionState = 'disconnected';
      return false;
    }

    this.connecting = true;
    this.connectionState = 'connecting';
    console.log('[Telegram] Connecting...');

    try {
      // Create custom HTTPS agent that forces IPv4
      const agent = new https.Agent({
        family: 4,  // Force IPv4
        keepAlive: true,
        keepAliveMsecs: 30000
      });

      this.bot = new Telegraf(this.config.get('telegram.token'), {
        telegram: {
          agent: agent,
          apiRoot: 'https://api.telegram.org'
        }
      });

      // Setup handlers
      this.setupHandlers();

      // Setup error handlers
      this.bot.catch((err, ctx) => {
        console.error('[Telegram] Bot error:', err.message);
        // Don't crash on individual message errors
        try {
          if (ctx && ctx.reply) {
            ctx.reply('An error occurred processing your request. Please try again.');
          }
        } catch (e) {
          console.error('[Telegram] Failed to send error message:', e.message);
        }
      });

      // Test connection with multiple retries
      const connected = await this.testConnection();

      if (connected) {
        // Start polling
        await this.startPolling();

        // Start health monitoring
        this.startHealthMonitoring();

        this.ready = true;
        this.connecting = false;
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000; // Reset delay
        this.connectionState = 'connected';
        console.log('[Telegram] ✅ Connected and ready!');
        this.emit('ready');
        return true;
      } else {
        throw new Error('Connection test failed');
      }
    } catch (err) {
      console.error('[Telegram] ❌ Connection failed:', err.message);
      this.ready = false;
      this.connecting = false;
      this.connectionState = 'disconnected';

      // Schedule reconnection
      this.scheduleReconnect();
      return false;
    }
  }

  setupHandlers() {
    // Commands
    this.bot.command('start', (ctx) => this.safeHandle(ctx, () => this.handleStart(ctx)));
    this.bot.command('help', (ctx) => this.safeHandle(ctx, () => this.handleHelp(ctx)));

    // Handle all text messages as potential commands
    this.bot.on('text', async (ctx) => {
      const text = ctx.message.text;
      if (text.startsWith('/')) {
        await this.safeHandle(ctx, () => this.handleCommand(ctx));
      }
    });

    // Handle button callbacks
    this.bot.on('callback_query', async (ctx) => {
      await this.safeHandle(ctx, () => this.handleCallback(ctx));
    });

    // Handle polling errors
    this.bot.on('polling_error', (error) => {
      console.error('[Telegram] Polling error:', error.message);

      // Check if it's a network error that requires reconnection
      if (this.isNetworkError(error)) {
        console.log('[Telegram] Network error detected, reconnecting...');
        this.handleDisconnection();
      }
    });
  }

  async safeHandle(ctx, handler) {
    try {
      await handler();
      this.lastHealthCheck = Date.now(); // Update health check on successful message
    } catch (err) {
      console.error('[Telegram] Handler error:', err.message);
      try {
        if (ctx && ctx.reply) {
          await ctx.reply('An error occurred. Please try again.');
        }
      } catch (e) {
        console.error('[Telegram] Failed to send error response:', e.message);
      }
    }
  }

  isNetworkError(error) {
    const networkErrors = [
      'ETIMEDOUT',
      'ECONNRESET',
      'ECONNREFUSED',
      'ENOTFOUND',
      'ENETUNREACH',
      'EHOSTUNREACH',
      'EPIPE',
      'EAI_AGAIN'
    ];

    return networkErrors.some(code =>
      error.code === code ||
      error.message.includes(code) ||
      error.message.includes('network') ||
      error.message.includes('timeout') ||
      error.message.includes('connection')
    );
  }

  async testConnection(retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        console.log(`[Telegram] Testing connection (attempt ${i + 1}/${retries})...`);

        const testPromise = this.bot.telegram.getMe();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Connection test timeout')), 15000)
        );

        const botInfo = await Promise.race([testPromise, timeoutPromise]);
        console.log(`[Telegram] ✓ Bot authenticated: @${botInfo.username}`);
        this.lastHealthCheck = Date.now();
        return true;
      } catch (err) {
        console.error(`[Telegram] Connection test failed (${i + 1}/${retries}):`, err.message);

        if (i < retries - 1) {
          // Wait before retry with exponential backoff
          const delay = Math.min(1000 * Math.pow(2, i), 5000);
          console.log(`[Telegram] Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    return false;
  }

  async startPolling() {
    try {
      // Remove any existing webhooks
      await this.bot.telegram.deleteWebhook({ drop_pending_updates: true });

      // Start polling (don't await - it runs indefinitely)
      this.bot.launch({
        allowedUpdates: ['message', 'callback_query'],
        dropPendingUpdates: true
      }).catch(err => {
        console.error('[Telegram] Polling error:', err.message);
        if (this.isNetworkError(err)) {
          this.handleDisconnection();
        }
      });

      // Give it a moment to start
      await new Promise(resolve => setTimeout(resolve, 1000));

      console.log('[Telegram] Polling started');

      // Enable graceful stop
      const stopHandler = () => {
        console.log('[Telegram] Graceful shutdown requested');
        this.disconnect();
      };

      process.once('SIGINT', stopHandler);
      process.once('SIGTERM', stopHandler);
    } catch (err) {
      console.error('[Telegram] Failed to start polling:', err.message);
      throw err;
    }
  }

  startHealthMonitoring() {
    // Clear any existing health check
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Check connection health every 30 seconds
    this.healthCheckInterval = setInterval(async () => {
      await this.checkHealth();
    }, this.healthCheckTimeout);
  }

  async checkHealth() {
    // If we haven't received any activity in a while, ping the bot API
    const timeSinceLastCheck = Date.now() - this.lastHealthCheck;

    if (timeSinceLastCheck > this.healthCheckTimeout) {
      console.log('[Telegram] Health check: Pinging bot API...');

      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Health check timeout')), 10000)
        );

        await Promise.race([
          this.bot.telegram.getMe(),
          timeoutPromise
        ]);

        this.lastHealthCheck = Date.now();
        console.log('[Telegram] Health check: OK');
      } catch (err) {
        console.error('[Telegram] Health check failed:', err.message);

        if (this.isNetworkError(err)) {
          console.log('[Telegram] Health check indicates network issue, reconnecting...');
          this.handleDisconnection();
        }
      }
    }
  }

  handleDisconnection() {
    if (this.connectionState === 'reconnecting' || this.connectionState === 'connecting') {
      console.log('[Telegram] Already reconnecting, skipping...');
      return;
    }

    console.log('[Telegram] Handling disconnection...');
    this.ready = false;
    this.connectionState = 'reconnecting';

    // Stop health monitoring
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // Stop the bot
    try {
      if (this.bot) {
        this.bot.stop();
      }
    } catch (err) {
      console.error('[Telegram] Error stopping bot:', err.message);
    }

    // Schedule reconnection
    this.scheduleReconnect();
  }

  scheduleReconnect() {
    // Clear any existing reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectAttempts++;

    // Calculate delay with exponential backoff
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, Math.min(this.reconnectAttempts - 1, 6)),
      this.maxReconnectDelay
    );

    console.log(`[Telegram] Scheduling reconnection attempt ${this.reconnectAttempts} in ${delay}ms...`);

    this.reconnectTimer = setTimeout(async () => {
      console.log(`[Telegram] Reconnection attempt ${this.reconnectAttempts}...`);
      await this.connect();
    }, delay);
  }

  async handleStart(ctx) {
    const userId = ctx.from.id.toString();

    if (!this.config.isUserAllowed('telegram', userId)) {
      await ctx.reply(this.botService.formatter.formatUnauthorized(userId, 'Telegram'));
      return;
    }

    const message = `👋 Welcome to VibeManager Bot!

🎯 What I can do:
• Create and manage AI coding sessions
• Start autonomous Ralph loops
• Monitor task progress
• Send notifications when tasks complete

📚 Quick Start:
/create my-project - Create a new session
/status - Check all sessions
/help - Show all commands

🌐 Dashboard: http://localhost:3131`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('📚 Show Commands', 'help')]
    ]);

    await ctx.reply(message, keyboard);
  }

  async handleHelp(ctx) {
    const helpText = this.botService.parser.getHelp();
    await ctx.reply('📚 VibeManager Bot Commands\n\n' + helpText);
  }

  async handleCommand(ctx) {
    const userId = ctx.from.id.toString();

    // Check authorization
    if (!this.config.isUserAllowed('telegram', userId)) {
      await ctx.reply(this.botService.formatter.formatUnauthorized(userId, 'Telegram'));
      return;
    }

    // Parse command
    const parsed = this.botService.parser.parse(ctx.message.text);

    if (!parsed || parsed.error) {
      if (parsed?.error === 'unknown_command') {
        await ctx.reply(`Unknown command: ${parsed.command}\n\nUse /help to see available commands.`);
      } else if (parsed?.error === 'missing_subcommand') {
        await ctx.reply(`Missing subcommand. Available: ${parsed.availableSubcommands.join(', ')}`);
      } else {
        await ctx.reply(`Invalid command. Use /help for help.`);
      }
      return;
    }

    // Validate
    const validation = this.botService.parser.validate(parsed);
    if (!validation.valid) {
      const usage = this.botService.parser.formatUsage(parsed.command, parsed.subcommand);
      await ctx.reply(`❌ Missing parameters: ${validation.missing.join(', ')}\n\nUsage: ${usage}`);
      return;
    }

    // Execute command
    try {
      const result = await this.botService.handleCommand(parsed, {
        platform: 'telegram',
        userId,
        username: ctx.from.username
      });

      // Send response
      await this.sendResponse(ctx, result);
    } catch (err) {
      console.error('[Telegram] Command error:', err);
      await ctx.reply(this.botService.formatter.formatError(err.message));
    }
  }

  async handleCallback(ctx) {
    const userId = ctx.from.id.toString();

    // Check authorization
    if (!this.config.isUserAllowed('telegram', userId)) {
      await ctx.answerCbQuery('Unauthorized');
      return;
    }

    const data = ctx.callbackQuery.data;

    // Handle special callbacks
    if (data === 'help') {
      const helpText = this.botService.parser.getHelp();
      await ctx.editMessageText('📚 VibeManager Bot Commands\n\n' + helpText);
      await ctx.answerCbQuery();
      return;
    }

    // Button format: "action:session:param"
    const [action, sessionName, param] = data.split(':');

    try {
      let result;

      switch (action) {
        case 'start':
          result = await this.botService.handleCommand(
            { command: 'start', params: { name: sessionName } },
            { platform: 'telegram', userId }
          );
          break;

        case 'stop':
          result = await this.botService.handleCommand(
            { command: 'stop', params: { name: sessionName } },
            { platform: 'telegram', userId }
          );
          break;

        case 'status':
          result = await this.botService.handleCommand(
            { command: 'status', params: { name: sessionName } },
            { platform: 'telegram', userId }
          );
          break;

        case 'tasks':
          result = await this.botService.handleCommand(
            { command: 'tasks', params: { session: sessionName } },
            { platform: 'telegram', userId }
          );
          break;

        case 'ralph_start':
          result = await this.botService.handleCommand(
            { command: 'ralph', subcommand: 'start', params: { session: sessionName } },
            { platform: 'telegram', userId }
          );
          break;

        case 'ralph_pause':
          result = await this.botService.handleCommand(
            { command: 'ralph', subcommand: 'pause', params: { session: sessionName } },
            { platform: 'telegram', userId }
          );
          break;

        case 'ralph_resume':
          result = await this.botService.handleCommand(
            { command: 'ralph', subcommand: 'resume', params: { session: sessionName } },
            { platform: 'telegram', userId }
          );
          break;

        default:
          await ctx.answerCbQuery('Unknown action');
          return;
      }

      // Edit original message with result
      await ctx.editMessageText(result.text, result.keyboard);
      await ctx.answerCbQuery();
    } catch (err) {
      console.error('[Telegram] Callback error:', err);
      await ctx.answerCbQuery(`Error: ${err.message}`);
    }
  }

  async sendResponse(ctx, result) {
    // Create inline keyboard if buttons provided
    const keyboard = result.buttons ? this.createKeyboard(result.buttons) : undefined;

    await ctx.reply(result.text, keyboard);
  }

  createKeyboard(buttons) {
    // Group buttons into rows (max 2 per row for better mobile UX)
    const rows = [];
    for (let i = 0; i < buttons.length; i += 2) {
      const row = buttons.slice(i, i + 2).map(btn => {
        if (btn.url) {
          return Markup.button.url(btn.label, btn.url);
        }
        return Markup.button.callback(btn.label, btn.id);
      });
      rows.push(row);
    }

    return Markup.inlineKeyboard(rows);
  }

  async sendNotification(userId, message) {
    if (!this.ready) {
      console.log('[Telegram] Bot not ready, queuing notification...');
      // Could implement a queue here for offline notifications
      return false;
    }

    try {
      const keyboard = message.buttons ? this.createKeyboard(message.buttons) : undefined;
      await this.bot.telegram.sendMessage(userId, message.text, keyboard);
      this.lastHealthCheck = Date.now(); // Update health check on successful send
      return true;
    } catch (err) {
      console.error('[Telegram] Failed to send notification:', err.message);

      // Check if it's a network error
      if (this.isNetworkError(err)) {
        console.log('[Telegram] Network error during notification, reconnecting...');
        this.handleDisconnection();
      }

      return false;
    }
  }

  disconnect() {
    console.log('[Telegram] Disconnecting...');

    // Clear reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Clear health check
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // Stop the bot
    if (this.bot) {
      try {
        this.bot.stop();
      } catch (err) {
        console.error('[Telegram] Error stopping bot:', err.message);
      }
    }

    this.ready = false;
    this.connectionState = 'disconnected';
    console.log('[Telegram] Disconnected');
  }

  getStatus() {
    return {
      connected: this.ready,
      enabled: !!this.config.get('telegram.token'),
      connectionState: this.connectionState,
      reconnectAttempts: this.reconnectAttempts,
      lastHealthCheck: new Date(this.lastHealthCheck).toISOString()
    };
  }
}

module.exports = TelegramClient;
