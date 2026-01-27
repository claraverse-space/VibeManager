// telegram-client.js - Telegram bot client
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
  }

  async connect() {
    if (!this.config.get('telegram.token')) {
      console.log('[Telegram] No token provided, skipping Telegram bot');
      return false;
    }

    console.log('[Telegram] Connecting...');

    // Create custom HTTPS agent that forces IPv4
    const agent = new https.Agent({
      family: 4,  // Force IPv4
      keepAlive: true
    });

    this.bot = new Telegraf(this.config.get('telegram.token'), {
      telegram: {
        agent: agent,
        apiRoot: 'https://api.telegram.org'
      }
    });

    // Commands
    this.bot.command('start', (ctx) => this.handleStart(ctx));
    this.bot.command('help', (ctx) => this.handleHelp(ctx));

    // Handle all text messages as potential commands
    this.bot.on('text', async (ctx) => {
      const text = ctx.message.text;
      if (text.startsWith('/')) {
        await this.handleCommand(ctx);
      }
    });

    // Handle button callbacks
    this.bot.on('callback_query', async (ctx) => {
      await this.handleCallback(ctx);
    });

    this.bot.on('error', (error) => {
      console.error('[Telegram] Error:', error);
      this.emit('error', error);
    });

    try {
      console.log('[Telegram] Testing bot connection...');

      // Test connection first with a timeout
      const testPromise = Promise.race([
        this.bot.telegram.getMe(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Connection test timeout (10s)')), 10000))
      ]);

      testPromise.then(async botInfo => {
        console.log(`[Telegram] Bot authenticated: @${botInfo.username}`);
        console.log('[Telegram] Starting polling (this may take a moment)...');

        try {
          // Start polling without webhook
          await this.bot.telegram.deleteWebhook({ drop_pending_updates: true });

          // Use launch() but don't await it - let it run in background
          this.bot.launch({
            allowedUpdates: ['message', 'callback_query']
          });

          // Mark as ready immediately after launch is called
          console.log('[Telegram] ✅ Polling started successfully!');
          this.ready = true;
          this.emit('ready');

          // Enable graceful stop
          process.once('SIGINT', () => this.bot.stop('SIGINT'));
          process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
        } catch (err) {
          console.error('[Telegram] ❌ Failed to start polling:', err.message);
          this.ready = false;
        }
      }).catch(err => {
        console.error('[Telegram] ❌ Connection test failed:', err.message);
        this.ready = false;
      });

      return true;
    } catch (err) {
      console.error('[Telegram] Failed to initialize:', err.message);
      return false;
    }
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
    if (!this.ready) return false;

    try {
      const keyboard = message.buttons ? this.createKeyboard(message.buttons) : undefined;
      await this.bot.telegram.sendMessage(userId, message.text, keyboard);
      return true;
    } catch (err) {
      console.error('[Telegram] Failed to send notification:', err.message);
      return false;
    }
  }

  disconnect() {
    if (this.bot) {
      this.bot.stop();
      this.ready = false;
      console.log('[Telegram] Disconnected');
    }
  }
}

module.exports = TelegramClient;
