// telegram-client.js - Simple Telegram bot client
const { Telegraf, Markup } = require('telegraf');
const EventEmitter = require('events');

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

    try {
      this.bot = new Telegraf(this.config.get('telegram.token'));

      // Setup handlers
      this.setupHandlers();

      // Setup error handlers
      this.bot.catch((err, ctx) => {
        console.error('[Telegram] Bot error:', err.message);
        try {
          if (ctx && ctx.reply) {
            ctx.reply('An error occurred processing your request. Please try again.');
          }
        } catch (e) {
          console.error('[Telegram] Failed to send error message:', e.message);
        }
      });

      // Test connection
      const botInfo = await this.bot.telegram.getMe();
      console.log(`[Telegram] Bot authenticated: @${botInfo.username}`);

      // Start polling
      await this.startPolling();

      this.ready = true;
      console.log('[Telegram] Connected and ready');
      this.emit('ready');
      return true;
    } catch (err) {
      console.error('[Telegram] Connection failed:', err.message);
      this.ready = false;
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
    });
  }

  async safeHandle(ctx, handler) {
    try {
      await handler();
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

  async startPolling() {
    try {
      // Remove any existing webhooks
      await this.bot.telegram.deleteWebhook({ drop_pending_updates: true });

      // Start polling
      this.bot.launch({
        allowedUpdates: ['message', 'callback_query'],
        dropPendingUpdates: true
      });

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

  async handleStart(ctx) {
    const userId = ctx.from.id.toString();

    if (!this.config.isUserAllowed('telegram', userId)) {
      await ctx.reply(this.botService.formatter.formatUnauthorized(userId, 'Telegram'));
      return;
    }

    const message = `Welcome to VibeManager Bot!

What I can do:
• Create and manage AI coding sessions
• Start autonomous Ralph loops that run 24/7
• Monitor task progress & logs in real-time
• Track GPU usage and system resources
• Send notifications when tasks complete
• Execute tasks in the background while you sleep!

Background Execution:
Start a Ralph loop and close this app - tasks continue running!
I'll notify you when:
  [DONE] Tasks complete
  [WARN] Tasks get stuck
  [COMPLETE] Ralph finishes all work

Essential Commands:
Session Management:
/create <name> - Create new session
/start <name> - Start session
/stop <name> - Stop session
/status [name] - Check session status
/list - List all sessions

Task Management:
/task <session> <description> - Add task
/tasks <session> - View all tasks
/progress <session> - Current task progress

Ralph Control (Autonomous Loop):
/ralph start <session> - Start autonomous loop
/ralph pause <session> - Pause loop
/ralph resume <session> - Resume loop
/ralph stop <session> - Stop loop

Monitoring:
/logs <session> [lines] - View session logs
/gpu - Show GPU statistics
/attach <session> - Get terminal link
/code <session> - Get VS Code link

/help - Show detailed command help

Dashboard: http://localhost:3131`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('[HELP] Show Commands', 'help')]
    ]);

    await ctx.reply(message, keyboard);
  }

  async handleHelp(ctx) {
    const helpText = this.botService.parser.getHelp();
    await ctx.reply('[HELP] VibeManager Bot Commands\n\n' + helpText);
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
      await ctx.reply(`[ERROR] Missing parameters: ${validation.missing.join(', ')}\n\nUsage: ${usage}`);
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
      await ctx.editMessageText('[HELP] VibeManager Bot Commands\n\n' + helpText);
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
      console.log('[Telegram] Bot not ready, cannot send notification');
      return false;
    }

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
    console.log('[Telegram] Disconnecting...');

    if (this.bot) {
      try {
        this.bot.stop();
      } catch (err) {
        console.error('[Telegram] Error stopping bot:', err.message);
      }
    }

    this.ready = false;
    console.log('[Telegram] Disconnected');
  }

  getStatus() {
    return {
      connected: this.ready,
      enabled: !!this.config.get('telegram.token')
    };
  }
}

module.exports = TelegramClient;
