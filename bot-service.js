// bot-service.js - Telegram bot service orchestrator (Discord removed)
const EventEmitter = require('events');
const BotConfig = require('./bot-config');
const BotParser = require('./bot-parser');
const BotFormatter = require('./bot-formatter');
const TelegramClient = require('./telegram-client');

class BotService extends EventEmitter {
  constructor(sessionManager, ralphLoop, gpuMonitor = null) {
    super();
    this.sessionManager = sessionManager;
    this.ralphLoop = ralphLoop;
    this.gpuMonitor = gpuMonitor;

    this.config = new BotConfig();
    this.parser = new BotParser();
    this.formatter = new BotFormatter();

    this.telegram = null;

    // Track user subscriptions for notifications
    this.subscriptions = new Map(); // sessionName -> Set<{platform, userId}>
  }

  async initialize() {
    console.log('[BotService] Initializing Telegram bot...');

    // Initialize Telegram with robust connection
    if (this.config.isTelegramEnabled()) {
      this.telegram = new TelegramClient(this.config, this);

      // Listen for connection events
      this.telegram.on('ready', () => {
        console.log('[BotService] Telegram bot is ready');
        this.emit('telegram:ready');
      });

      this.telegram.on('error', (err) => {
        console.error('[BotService] Telegram error:', err.message);
        this.emit('telegram:error', err);
      });

      // Initial connection (will auto-reconnect if fails)
      await this.telegram.connect();
    } else {
      console.log('[BotService] Telegram bot not configured');
    }

    // Subscribe to VibeManager events
    this.setupEventListeners();

    console.log('[BotService] Initialized');
  }

  setupEventListeners() {
    // Task completion
    this.ralphLoop.on('taskComplete', ({ sessionName, taskId }) => {
      const task = this.sessionManager.getTask(sessionName, taskId);
      if (task) {
        this.notifySubscribers(sessionName, {
          text: this.formatter.formatTaskComplete(sessionName, task),
          buttons: [
            { id: `status:${sessionName}`, label: '📊 Status' },
            { id: `tasks:${sessionName}`, label: '📝 Tasks' },
            { id: `ralph_pause:${sessionName}`, label: '⏸️ Pause' }
          ]
        });
      }
    });

    // Task stuck
    this.ralphLoop.on('stuck', ({ sessionName, reason }) => {
      const tasks = this.sessionManager.getTasks(sessionName);
      const currentTask = tasks.find(t => t.status === 'in_progress');

      if (currentTask) {
        this.notifySubscribers(sessionName, {
          text: this.formatter.formatTaskStuck(sessionName, currentTask, 3),
          buttons: [
            { id: `ralph_verify:${sessionName}`, label: '🔍 Verify' },
            { id: `ralph_resume:${sessionName}`, label: '▶️ Resume' },
            { id: `ralph_stop:${sessionName}`, label: '🛑 Stop' }
          ]
        });
      }
    });

    // Ralph complete
    this.ralphLoop.on('complete', ({ sessionName, state }) => {
      const stats = this.sessionManager.getTaskStats(sessionName);
      const duration = Date.now() - (state.startedAt || 0);

      this.notifySubscribers(sessionName, {
        text: this.formatter.formatRalphComplete(sessionName, stats.completed, duration),
        buttons: [
          { id: `status:${sessionName}`, label: '📊 Status' },
          { id: `tasks:${sessionName}`, label: '📝 Tasks' }
        ]
      });
    });

    // Session error
    this.sessionManager.on && this.sessionManager.on('error', ({ sessionName, error }) => {
      this.notifySubscribers(sessionName, {
        text: this.formatter.formatError(`Session error in ${sessionName}`, {
          suggestion: error.message
        }),
        buttons: [
          { id: `status:${sessionName}`, label: '📊 Status' },
          { id: `stop:${sessionName}`, label: '🛑 Stop' }
        ]
      });
    });
  }

  async handleCommand(parsed, context) {
    const { command, subcommand, params } = parsed;
    const { platform, userId, username } = context;

    // Subscribe user to session notifications automatically
    if (params.name || params.session) {
      const sessionName = params.name || params.session;
      this.subscribe(sessionName, platform, userId);
    }

    // Route to appropriate handler
    try {
      let result;

      switch (command) {
        // Session management
        case 'create':
          result = await this.handleCreate(params);
          break;
        case 'start':
          result = await this.handleStart(params);
          break;
        case 'stop':
          result = await this.handleStop(params);
          break;
        case 'delete':
          result = await this.handleDelete(params);
          break;
        case 'list':
          result = await this.handleList(params);
          break;
        case 'status':
          result = await this.handleStatus(params);
          break;
        case 'attach':
          result = await this.handleAttach(params);
          break;
        case 'code':
          result = await this.handleCode(params);
          break;

        // Task management
        case 'task':
          result = await this.handleAddTask(params);
          break;
        case 'tasks':
          result = await this.handleTasks(params);
          break;
        case 'progress':
          result = await this.handleProgress(params);
          break;
        case 'prd':
          result = await this.handlePRD(params);
          break;

        // Monitoring
        case 'logs':
          result = await this.handleLogs(params);
          break;
        case 'gpu':
          result = await this.handleGPU(params);
          break;

        // Ralph control
        case 'ralph':
          result = await this.handleRalph(subcommand, params);
          break;

        // Help
        case 'help':
          result = { text: this.formatter.formatHelp(this.parser.getHelp(params.command)) };
          break;

        default:
          result = { text: this.formatter.formatError('Unknown command') };
      }

      return result;
    } catch (err) {
      console.error('[BotService] Command error:', err);
      return { text: this.formatter.formatError(err.message) };
    }
  }

  // Command handlers

  async handleCreate(params) {
    const { name, path } = params;
    const projectPath = path || `${process.env.HOME}/${name}`;

    const session = this.sessionManager.create(name, projectPath, 80, 24, '', 'auto', false);

    return {
      text: this.formatter.formatSessionCreated(session),
      buttons: [
        { id: `start:${name}`, label: '▶️ Start' },
        { id: `status:${name}`, label: '📊 Status' }
      ]
    };
  }

  async handleStart(params) {
    const { name } = params;
    const session = this.sessionManager.get(name);

    if (!session) {
      return { text: this.formatter.formatError(`Session "${name}" not found`) };
    }

    if (session.alive) {
      return {
        text: `ℹ️ Session "${name}" is already running`,
        buttons: [
          { id: `stop:${name}`, label: '⏸️ Stop' },
          { id: `status:${name}`, label: '📊 Status' }
        ]
      };
    }

    this.sessionManager.revive(name);

    return {
      text: `✅ Session "${name}" started\n\n💻 Code: http://localhost:${process.env.CODE_PORT || 8083}`,
      buttons: [
        { id: `stop:${name}`, label: '⏸️ Stop' },
        { id: `ralph_start:${name}`, label: '🔄 Start Ralph' },
        { id: `status:${name}`, label: '📊 Status' }
      ]
    };
  }

  async handleStop(params) {
    const { name } = params;
    const session = this.sessionManager.get(name);

    if (!session) {
      return { text: this.formatter.formatError(`Session "${name}" not found`) };
    }

    this.sessionManager.stop(name);

    return {
      text: `⏸️ Session "${name}" stopped\n\nAll progress is saved.`,
      buttons: [
        { id: `start:${name}`, label: '▶️ Start Again' },
        { id: `status:${name}`, label: '📊 Status' }
      ]
    };
  }

  async handleDelete(params) {
    const { name } = params;
    this.sessionManager.delete(name);

    return {
      text: `🗑️ Session "${name}" deleted`,
      buttons: []
    };
  }

  async handleList(params) {
    const sessions = this.sessionManager.list();

    return {
      text: this.formatter.formatSessionList(sessions),
      buttons: []
    };
  }

  async handleStatus(params) {
    const { name } = params;

    if (!name) {
      // Show all sessions
      const sessions = this.sessionManager.list();
      return {
        text: this.formatter.formatSessionList(sessions),
        buttons: []
      };
    }

    const session = this.sessionManager.get(name);
    if (!session) {
      return { text: this.formatter.formatError(`Session "${name}" not found`) };
    }

    const ralphStatus = this.ralphLoop.getLoopState(name);

    return {
      text: this.formatter.formatSessionStatus(session, ralphStatus),
      buttons: [
        session.alive
          ? { id: `stop:${name}`, label: '⏸️ Stop' }
          : { id: `start:${name}`, label: '▶️ Start' },
        { id: `tasks:${name}`, label: '📝 Tasks' },
        { id: `ralph_start:${name}`, label: '🔄 Ralph' }
      ]
    };
  }

  async handleAttach(params) {
    const { name } = params;
    const session = this.sessionManager.get(name);

    if (!session) {
      return { text: this.formatter.formatError(`Session "${name}" not found`) };
    }

    const url = `http://localhost:${process.env.PORT || 3131}/attach/${name}`;

    return {
      text: `🔗 Terminal Attachment\n\nSession: ${name}\nURL: ${url}\n\n💡 Copy this URL and open it in your browser to access the terminal.\n\nNote: This only works if you're on the same machine or network as the server.`,
      buttons: [
        { id: `status:${name}`, label: '📊 Status' }
      ]
    };
  }

  async handleCode(params) {
    const { name } = params;
    const session = this.sessionManager.get(name);

    if (!session) {
      return { text: this.formatter.formatError(`Session "${name}" not found`) };
    }

    const url = `http://localhost:${process.env.CODE_PORT || 8083}`;

    return {
      text: `💻 VS Code Editor\n\nSession: ${name}\nURL: ${url}\n\n💡 Copy this URL and open it in your browser to access the editor.\n\nNote: This only works if you're on the same machine or network as the server.`,
      buttons: [
        { id: `status:${name}`, label: '📊 Status' }
      ]
    };
  }

  async handleAddTask(params) {
    const { session, description } = params;

    if (!this.sessionManager.get(session)) {
      return { text: this.formatter.formatError(`Session "${session}" not found`) };
    }

    // Check if description exists and is not empty
    if (!description || description.trim() === '') {
      return { text: this.formatter.formatError('Task description is required') };
    }

    // Use first 60 chars as title, full text as description
    const title = description.length > 60
      ? description.slice(0, 60) + '...'
      : description;

    const task = this.sessionManager.addTask(session, title, description);

    return {
      text: `✅ Task Added\n\n📋 Task: ${description}\n🆔 ID: ${task.id}\n⚡ Status: Pending`,
      buttons: [
        { id: `ralph_start:${session}`, label: '🔄 Start Ralph' },
        { id: `tasks:${session}`, label: '📝 View All' }
      ]
    };
  }

  async handleTasks(params) {
    const { session } = params;
    const tasks = this.sessionManager.getTasks(session);

    return {
      text: this.formatter.formatTaskList(tasks, session),
      buttons: [
        { id: `progress:${session}`, label: '📊 Progress' },
        { id: `ralph_start:${session}`, label: '🔄 Start Ralph' }
      ]
    };
  }

  async handleProgress(params) {
    const { session } = params;
    const tasks = this.sessionManager.getTasks(session);
    const currentTask = tasks.find(t => t.status === 'in_progress') || tasks[0];

    if (!currentTask) {
      return { text: `No tasks found for ${session}` };
    }

    return {
      text: this.formatter.formatTaskProgress(currentTask, session),
      buttons: [
        { id: `tasks:${session}`, label: '📝 All Tasks' },
        { id: `ralph_pause:${session}`, label: '⏸️ Pause' }
      ]
    };
  }

  async handlePRD(params) {
    const { session, description } = params;

    if (!this.sessionManager.get(session)) {
      return { text: this.formatter.formatError(`Session "${session}" not found`) };
    }

    if (!description || description.trim() === '') {
      return { text: this.formatter.formatError('PRD description is required') };
    }

    // Create a comprehensive PRD task
    const prdTitle = 'Product Requirements Document';
    const prdDescription = `Create and document PRD:\n\n${description}\n\nThis should include:\n- Overview and goals\n- User stories\n- Technical requirements\n- Success criteria`;

    const task = this.sessionManager.addTask(session, prdTitle, prdDescription);

    return {
      text: this.formatter.formatPRDCreated(session, description),
      buttons: [
        { id: `ralph_start:${session}`, label: '🔄 Start Ralph' },
        { id: `tasks:${session}`, label: '📝 View Tasks' }
      ]
    };
  }

  async handleLogs(params) {
    const { session, lines } = params;
    const numLines = parseInt(lines) || 50;

    if (!session) {
      return { text: this.formatter.formatError('Session name is required') };
    }

    const sessionObj = this.sessionManager.get(session);
    if (!sessionObj) {
      return { text: this.formatter.formatError(`Session "${session}" not found`) };
    }

    // Get scrollback content (logs)
    const logs = this.sessionManager.getScrollbackContent(session, 'latest');

    return {
      text: this.formatter.formatLogs(session, logs, numLines),
      buttons: [
        { id: `status:${session}`, label: '📊 Status' },
        { id: `tasks:${session}`, label: '📝 Tasks' }
      ]
    };
  }

  async handleGPU(params) {
    if (!this.gpuMonitor) {
      return {
        text: '🎮 GPU Stats\n\nGPU monitoring not available.\n\n💡 GPU monitoring requires the system to have GPU monitoring tools installed (nvidia-smi, rocm-smi, xpu-smi).',
        buttons: []
      };
    }

    try {
      const stats = this.gpuMonitor.getSummary();
      return {
        text: this.formatter.formatGPUStats(stats),
        buttons: []
      };
    } catch (err) {
      console.error('[BotService] GPU stats error:', err);
      return {
        text: this.formatter.formatError('Failed to get GPU stats', {
          suggestion: 'Make sure GPU monitoring tools are installed and accessible'
        }),
        buttons: []
      };
    }
  }

  async handleRalph(subcommand, params) {
    const { session } = params;

    if (!this.sessionManager.get(session)) {
      return { text: this.formatter.formatError(`Session "${session}" not found`) };
    }

    let result;

    switch (subcommand) {
      case 'start':
        this.ralphLoop.initLoopState(session, { maxIterations: 50, circuitBreakerThreshold: 3 });
        await this.ralphLoop.startLoop(session);
        result = {
          text: `🚀 Ralph Started\n\nAutonomous loop is running for ${session}!\nI'll notify you when tasks complete.`,
          buttons: [
            { id: `ralph_pause:${session}`, label: '⏸️ Pause' },
            { id: `progress:${session}`, label: '📊 Progress' },
            { id: `ralph_stop:${session}`, label: '🛑 Stop' }
          ]
        };
        break;

      case 'pause':
        this.ralphLoop.pauseLoop(session);
        result = {
          text: `⏸️ Ralph Paused\n\nLoop paused for ${session}. Progress saved.`,
          buttons: [
            { id: `ralph_resume:${session}`, label: '▶️ Resume' },
            { id: `status:${session}`, label: '📊 Status' },
            { id: `ralph_stop:${session}`, label: '🛑 Stop' }
          ]
        };
        break;

      case 'resume':
        await this.ralphLoop.resumeLoop(session);
        result = {
          text: `▶️ Ralph Resumed\n\nContinuing loop for ${session}...`,
          buttons: [
            { id: `ralph_pause:${session}`, label: '⏸️ Pause' },
            { id: `progress:${session}`, label: '📊 Progress' }
          ]
        };
        break;

      case 'stop':
        this.ralphLoop.stopLoop(session);
        result = {
          text: `🛑 Ralph Stopped\n\nLoop stopped for ${session}.`,
          buttons: [
            { id: `status:${session}`, label: '📊 Status' },
            { id: `ralph_start:${session}`, label: '🔄 Start Again' }
          ]
        };
        break;

      case 'verify':
        await this.ralphLoop.resumeWithVerification(session);
        result = {
          text: `🔍 Verification Started\n\nAsking Claude if the task is actually complete...`,
          buttons: [
            { id: `progress:${session}`, label: '📊 Progress' },
            { id: `ralph_stop:${session}`, label: '🛑 Stop' }
          ]
        };
        break;

      default:
        result = { text: this.formatter.formatError('Unknown Ralph subcommand') };
    }

    return result;
  }

  // Notification system

  subscribe(sessionName, platform, userId) {
    if (!this.subscriptions.has(sessionName)) {
      this.subscriptions.set(sessionName, new Set());
    }

    this.subscriptions.get(sessionName).add(JSON.stringify({ platform, userId }));
  }

  unsubscribe(sessionName, platform, userId) {
    if (!this.subscriptions.has(sessionName)) return;

    this.subscriptions.get(sessionName).delete(JSON.stringify({ platform, userId }));

    if (this.subscriptions.get(sessionName).size === 0) {
      this.subscriptions.delete(sessionName);
    }
  }

  async notifySubscribers(sessionName, message) {
    if (!this.subscriptions.has(sessionName)) return;

    const subscribers = this.subscriptions.get(sessionName);

    for (const subStr of subscribers) {
      const { platform, userId } = JSON.parse(subStr);

      try {
        if (platform === 'telegram' && this.telegram) {
          await this.telegram.sendNotification(userId, message);
        }
      } catch (err) {
        console.error(`[BotService] Failed to notify ${platform}:${userId}:`, err.message);
      }
    }
  }

  getStatus() {
    return {
      telegram: this.telegram ? this.telegram.getStatus() : {
        connected: false,
        enabled: false,
        connectionState: 'not_initialized'
      }
    };
  }

  async shutdown() {
    console.log('[BotService] Shutting down...');

    if (this.telegram) {
      this.telegram.disconnect();
    }

    console.log('[BotService] Shutdown complete');
  }
}

module.exports = BotService;
