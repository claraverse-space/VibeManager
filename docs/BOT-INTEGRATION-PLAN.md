# VibeManager Bot Integration - Implementation Plan

## Overview
Integrate Discord and Telegram bots with VibeManager to enable remote session management, PRD creation, status checking, and notifications through messaging platforms.

## Inspiration
Based on [Clawdbot](https://clawd.bot/) and [claude-code-telegram](https://github.com/RichardAtCT/claude-code-telegram) projects.

## Real-Life Use Cases

### 1. Mobile-First Developer
- Create sessions from phone while commuting
- Get completion notifications while away from desk
- Quick status checks without opening laptop
- Perfect for: Solo developers, freelancers, remote workers

### 2. Team Collaboration
- Shared Discord server for dev team
- All sessions visible to team members
- Coordinate parallel development efforts
- Share completion notifications in team channel
- Perfect for: Small dev teams, startups

### 3. Async Client Updates
- Client requests feature via Telegram
- Developer creates task through bot
- Bot notifies both parties on completion
- Perfect for: Freelancers, agencies

### 4. Overnight Development
- Start Ralph before bed with PRD
- Wake up to completion notification
- Review code from phone over coffee
- Perfect for: Side projects, exploratory work

### 5. Emergency Hotfix
- Get alerted to production issues
- Check logs via bot
- Create hotfix task on the go
- Monitor fix deployment
- Perfect for: On-call engineers, DevOps

## Architecture

```
┌─────────────────────────────────────────────┐
│         Messaging Platforms                  │
│  Discord │ Telegram │ Slack (future)        │
└──────────────┬──────────────────────────────┘
               │
        ┌──────▼──────┐
        │   Bot Layer  │
        │  - discord.js│
        │  - telegraf  │
        │  - grammy    │
        └──────┬───────┘
               │
        ┌──────▼────────────────────────────┐
        │   Bot Service (New Component)      │
        │                                    │
        │  1. Command Parser                 │
        │     - Parse slash commands         │
        │     - Extract intent from natural  │
        │       language using Claude        │
        │                                    │
        │  2. Session Manager                │
        │     - Create/start/stop sessions   │
        │     - Query session status         │
        │     - Attach/detach terminals      │
        │                                    │
        │  3. PRD Generator (AI-Assisted)    │
        │     - Convert conversation to PRD  │
        │     - Break down tasks             │
        │     - Validate task structure      │
        │                                    │
        │  4. Notification Engine            │
        │     - Task completion alerts       │
        │     - Error notifications          │
        │     - Progress updates             │
        │     - Custom webhooks              │
        │                                    │
        │  5. Permission Manager             │
        │     - User whitelists              │
        │     - Role-based access            │
        │     - Team workspaces              │
        │                                    │
        │  6. Media Handler                  │
        │     - Screenshot capture           │
        │     - Code snippet formatting      │
        │     - Log file sharing             │
        │                                    │
        └──────┬────────────────────────────┘
               │
        ┌──────▼──────┐
        │ VibeManager  │
        │  Core API    │
        │              │
        │  REST API    │
        │  WebSocket   │
        └──────┬───────┘
               │
        ┌──────▼──────┐
        │   Backend    │
        │  - Sessions  │
        │  - Ralph     │
        │  - Tasks     │
        │  - GPU Stats │
        └──────────────┘
```

## Bot Commands

### Session Management
- `/create <name> [path]` - Create new session
  - Example: `/create my-blog ~/projects/blog`
  - Optional: Specify agent type (claude-code, opencode)

- `/start <name>` - Start/revive session
  - Example: `/start my-blog`

- `/stop <name>` - Stop running session
  - Example: `/stop my-blog`

- `/delete <name>` - Delete session permanently
  - Example: `/delete old-project`

- `/status [name]` - Show status of all or specific session
  - Example: `/status` or `/status my-blog`
  - Shows: alive/stopped, current task, progress, GPU usage

- `/list` - List all sessions
  - Shows summary table with names, status, ports

- `/attach <name>` - Get terminal attachment link
  - Returns: URL to attach to tmux session

- `/code <name>` - Get VS Code editor link
  - Returns: URL to code-server instance

### PRD & Task Management
- `/prd <session> <description>` - Create PRD from natural language
  - Example: `/prd my-blog Build a blog with markdown support, comments, and RSS feed`
  - Bot uses Claude to break down into tasks

- `/task <session> <description>` - Add single task
  - Example: `/task my-blog Add dark mode toggle`

- `/tasks <session>` - List all tasks
  - Shows: task ID, title, status, progress

- `/progress <session>` - Show detailed progress
  - Shows: current task, steps, percentage, ETA

### Ralph Control
- `/ralph start <session>` - Start autonomous loop
  - Example: `/ralph start my-blog`

- `/ralph pause <session>` - Pause loop (keeps session alive)
  - Example: `/ralph pause my-blog`

- `/ralph resume <session>` - Resume paused loop
  - Example: `/ralph resume my-blog`

- `/ralph stop <session>` - Stop loop completely
  - Example: `/ralph stop my-blog`

- `/verify <session>` - Manually trigger stuck task verification
  - Example: `/verify my-blog`

### Monitoring & Debugging
- `/logs <session> [lines]` - Get recent logs
  - Example: `/logs my-blog 100`
  - Returns: Last N lines of terminal output

- `/gpu` - Show GPU statistics
  - Shows: utilization, memory, temperature for all GPUs

- `/screenshot <session>` - Take screenshot of code editor
  - Captures current editor view
  - Useful for sharing progress

- `/diff <session>` - Show recent git changes
  - Example: `/diff my-blog`
  - Shows: git diff since last commit

- `/commits <session> [n]` - Show recent commits
  - Example: `/commits my-blog 5`
  - Shows: Last N commit messages

### AI Conversation (Natural Language)
Users can just chat naturally without commands:

**Examples:**
```
User: "Create a new session for my blog project"
Bot: [interprets as /create command]

User: "How's the progress on my-blog?"
Bot: [interprets as /status my-blog]

User: "I need to build a REST API with user auth, posts, and comments"
Bot: [interprets as /prd, generates structured PRD]

User: "Stop everything"
Bot: [interprets as /ralph stop or /stop, asks for confirmation]
```

Bot uses Claude API to:
1. Parse user intent
2. Extract parameters (session names, task descriptions)
3. Map to appropriate commands
4. Execute and respond naturally

## Phase 1: Core Integration (MVP)

**Goal:** Basic bot functionality with essential commands

### Discord Bot
**Files to create:**
- `src/bot/discord/client.js` - Discord client setup
- `src/bot/discord/commands.js` - Command handlers
- `src/bot/discord/embeds.js` - Rich message formatting
- `src/bot/discord/events.js` - Event handlers (ready, message)

**Dependencies:**
```json
{
  "discord.js": "^14.14.1"
}
```

**Features:**
- ✅ Bot authentication via Discord token
- ✅ Slash command registration
- ✅ Basic commands: /create, /start, /stop, /status, /list
- ✅ Rich embeds for status display
- ✅ User whitelist (only allowed users can use bot)

### Telegram Bot
**Files to create:**
- `src/bot/telegram/client.js` - Telegram client setup
- `src/bot/telegram/commands.js` - Command handlers
- `src/bot/telegram/keyboards.js` - Inline keyboards for actions
- `src/bot/telegram/events.js` - Event handlers

**Dependencies:**
```json
{
  "telegraf": "^4.15.1"
}
```

**Features:**
- ✅ Bot authentication via Telegram token
- ✅ Command handlers (same as Discord)
- ✅ Inline keyboards for quick actions
- ✅ User whitelist via Telegram user ID

### Bot Service Core
**Files to create:**
- `src/bot/service.js` - Main bot service
- `src/bot/parser.js` - Command parser
- `src/bot/formatter.js` - Response formatter
- `src/bot/auth.js` - User authentication

**Features:**
- ✅ Unified command interface
- ✅ Platform-agnostic command handling
- ✅ User permission checking
- ✅ Response formatting for each platform

### API Extensions
**Files to modify:**
- `src/server.js` - Add bot webhook endpoints

**New endpoints:**
```
POST /api/bot/webhook/discord
POST /api/bot/webhook/telegram
GET  /api/bot/users
POST /api/bot/users/whitelist
```

**Features:**
- ✅ Webhook endpoints for platform events
- ✅ User management API
- ✅ Bot configuration API

### Configuration
**Files to create:**
- `.env.example` - Example bot configuration

**Environment variables:**
```bash
# Discord Bot
DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_ALLOWED_USERS=user1,user2,user3

# Telegram Bot
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_ALLOWED_USERS=123456789,987654321

# Bot Settings
BOT_ENABLED=true
BOT_COMMAND_PREFIX=/
```

### Testing
- Manual testing with real bots
- Mock responses for API testing
- User whitelist validation

### Documentation
**Files to create:**
- `docs/BOT_SETUP.md` - Setup guide
- `docs/BOT_COMMANDS.md` - Command reference

## Phase 2: Intelligent Interactions

**Goal:** AI-powered natural language understanding and PRD generation

### Natural Language Processing
**Files to create:**
- `src/bot/ai/intent.js` - Intent detection using Claude
- `src/bot/ai/prd-generator.js` - PRD generation from conversation
- `src/bot/ai/conversation.js` - Multi-turn conversation handling

**Features:**
- ✅ Detect user intent from natural language
- ✅ Extract parameters (session name, task description)
- ✅ Map intent to bot commands
- ✅ Confirm actions before execution
- ✅ Handle ambiguity ("Which session do you mean?")

### PRD Generation
**Features:**
- ✅ Convert freeform description to structured PRD
- ✅ Break down into individual tasks
- ✅ Suggest task order and dependencies
- ✅ Ask clarifying questions if needed
- ✅ Preview PRD before creation

**Example flow:**
```
User: "I need a blog site with markdown posts and comments"

Bot: 🤖 I'll create a PRD with these tasks:
     1. Setup project structure (React + Node.js)
     2. Markdown post rendering system
     3. Post database schema and API
     4. Comment system with nested replies
     5. Frontend UI components
     6. Tests and documentation

     Does this look good? Reply 'yes' to confirm, or describe changes.

User: "yes"

Bot: ✅ PRD created! Starting Ralph loop on 'blog-site'
```

### Status Summaries
**Features:**
- ✅ AI-generated plain English status updates
- ✅ Highlight important changes since last check
- ✅ Suggest next actions

**Example:**
```
/status my-blog

Bot: 📊 my-blog Status:

     Ralph is 60% through the PRD (3/5 tasks done)

     ✅ Project structure created
     ✅ Markdown rendering working
     ✅ Database schema and API deployed
     🔄 Currently: Building comment system (45% done)
     ⏳ Next: Frontend UI components

     🎯 On track! Estimated 2 more hours.
     💡 Tip: Check /logs for recent Claude decisions
```

### Code Snippets
**Features:**
- ✅ Share code snippets with syntax highlighting
- ✅ Format diffs nicely
- ✅ Extract key functions/classes

## Phase 3: Advanced Features

### Multi-User & Permissions
**Files to create:**
- `src/bot/permissions.js` - Role-based access control
- `src/bot/workspaces.js` - Team workspace management

**Features:**
- ✅ User roles (owner, admin, developer, viewer)
- ✅ Team workspaces (shared sessions)
- ✅ Per-session permissions
- ✅ Audit logs (who did what)

**Example:**
```
/workspace create team-xyz
/workspace add-user team-xyz @john developer
/workspace add-user team-xyz @sarah viewer

[Now @john can control sessions, @sarah can only view]
```

### Rich Media
**Files to create:**
- `src/bot/media/screenshots.js` - Screenshot capture
- `src/bot/media/uploads.js` - File upload handling

**Features:**
- ✅ Screenshot capture using Playwright
- ✅ Syntax-highlighted code images
- ✅ Progress visualization (charts, graphs)
- ✅ File uploads (PRD docs, config files)

### Inline Actions (Platform-Specific)
**Discord:**
- Button embeds for quick actions
- Example: [Start] [Stop] [View Logs] buttons on status message

**Telegram:**
- Inline keyboards for actions
- Quick reply buttons

**Example:**
```
Bot: 🎉 Task completed! What's next?
     [▶️ Continue] [⏸️ Pause] [📝 View Code] [🔄 Run Tests]
```

### Voice Messages (Telegram)
**Features:**
- ✅ Transcribe voice messages using Whisper API
- ✅ Process transcription as text command

**Example:**
```
User: [voice: "Hey, create a new session for my dashboard project"]
Bot: 🎤 Transcribed: "create a new session for my dashboard project"
     ✅ Session 'dashboard' created!
```

## Phase 4: Notifications & Alerts

### Notification Engine
**Files to create:**
- `src/bot/notifications/engine.js` - Notification dispatcher
- `src/bot/notifications/triggers.js` - Event triggers
- `src/bot/notifications/templates.js` - Message templates

### Notification Types

**1. Task Completion**
```
🎉 Task completed in 'my-blog'!

✅ Task: "Add comment system"
⏱️ Duration: 45 minutes
📝 Commits: 3 files changed
🔗 View: http://localhost:8083/my-blog

Ralph is moving to next task...
```

**2. Error Alerts**
```
🚨 Error in 'payment-service'!

❌ Task: "Add Stripe integration"
📋 Error: ModuleNotFoundError: No module named 'stripe'
💡 Claude suggests: Run `pip install stripe`

[Fix Automatically] [View Logs] [Stop Session]
```

**3. Stuck Task Warnings**
```
⚠️ Task stuck in 'landing-page'

🔴 Task: "Build hero section"
📊 Progress: 45% (no change for 3 iterations)
🔍 Last action: "Running CSS linting"

[Verify & Resume] [Force Resume] [Stop]
```

**4. Daily Summaries**
```
☀️ Good morning! Yesterday's summary:

📊 3 active sessions
✅ 7 tasks completed
⏱️ 12 hours of autonomous work
🔧 45 files changed

Top session: 'my-blog' (5 tasks done) 🏆

[View Details] [Start New Session]
```

**5. Custom Webhooks**
Users can define custom triggers:
```
/notify when my-blog completes send to #dev-channel
/notify when any-session errors send to @me
/notify daily summary at 9am send to @me
```

### Integration with External Services
**Files to create:**
- `src/bot/integrations/pagerduty.js`
- `src/bot/integrations/opsgenie.js`
- `src/bot/integrations/slack.js` (cross-platform forwarding)

**Features:**
- ✅ Forward critical errors to PagerDuty
- ✅ Create Opsgenie alerts on stuck tasks
- ✅ Cross-post to Slack from Discord/Telegram

## Technical Implementation Details

### Bot Service Architecture

```javascript
// src/bot/service.js
class BotService {
  constructor(vibeManager) {
    this.vibe = vibeManager;
    this.discord = null;
    this.telegram = null;
    this.parser = new CommandParser();
    this.notifications = new NotificationEngine();
  }

  async initialize() {
    if (process.env.DISCORD_BOT_TOKEN) {
      this.discord = new DiscordBot(this);
      await this.discord.connect();
    }

    if (process.env.TELEGRAM_BOT_TOKEN) {
      this.telegram = new TelegramBot(this);
      await this.telegram.connect();
    }

    // Subscribe to VibeManager events
    this.vibe.on('task:completed', this.onTaskComplete.bind(this));
    this.vibe.on('task:stuck', this.onTaskStuck.bind(this));
    this.vibe.on('session:error', this.onSessionError.bind(this));
  }

  async handleCommand(platform, userId, command, args) {
    // Check permissions
    if (!this.isAuthorized(userId)) {
      return 'Unauthorized. Contact admin to get access.';
    }

    // Parse command
    const action = this.parser.parse(command, args);

    // Execute action
    const result = await this.executeAction(action);

    // Format response for platform
    return this.formatResponse(platform, result);
  }

  async onTaskComplete(sessionName, taskId) {
    const users = await this.getSubscribedUsers(sessionName);
    users.forEach(userId => {
      this.notifications.send(userId, 'task_complete', {
        sessionName,
        taskId
      });
    });
  }
}
```

### Command Parser with AI

```javascript
// src/bot/ai/intent.js
class IntentDetector {
  async detectIntent(message) {
    // Use Claude API to understand natural language
    const prompt = `
      You are a bot command parser. The user said: "${message}"

      Determine the intent and extract parameters.

      Available intents:
      - create_session (params: name, path)
      - start_session (params: name)
      - stop_session (params: name)
      - check_status (params: name or "all")
      - create_prd (params: session, description)
      - add_task (params: session, description)

      Respond in JSON:
      {
        "intent": "create_session",
        "params": { "name": "my-blog", "path": "~/projects/blog" },
        "confidence": 0.95
      }
    `;

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }]
    });

    return JSON.parse(response.content[0].text);
  }
}
```

### PRD Generator

```javascript
// src/bot/ai/prd-generator.js
class PRDGenerator {
  async generate(description) {
    const prompt = `
      Create a PRD (Product Requirements Document) for this project:

      "${description}"

      Break it down into specific, actionable tasks.
      Each task should be completable in 30-90 minutes.
      Order tasks by dependencies.

      Respond in JSON:
      {
        "name": "Project Name",
        "description": "One sentence summary",
        "stories": [
          {
            "id": "task-1",
            "title": "Setup project structure",
            "description": "Detailed description of what to build"
          },
          ...
        ]
      }
    `;

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
    });

    const prd = JSON.parse(response.content[0].text);

    // Validate PRD structure
    this.validate(prd);

    return prd;
  }
}
```

### Discord Rich Embeds

```javascript
// src/bot/discord/embeds.js
function createStatusEmbed(session) {
  const embed = new EmbedBuilder()
    .setColor(session.alive ? 0x00ff00 : 0xff0000)
    .setTitle(`📊 ${session.name}`)
    .setDescription(session.alive ? 'Running' : 'Stopped')
    .addFields(
      { name: '📁 Path', value: session.path, inline: true },
      { name: '🤖 Agent', value: session.shellType, inline: true },
      { name: '⚡ Port', value: session.codePort.toString(), inline: true }
    )
    .setTimestamp();

  if (session.ralph?.active) {
    embed.addFields({
      name: '🔄 Ralph Status',
      value: `${session.ralph.currentTaskId} (${session.ralph.iterationCount} iterations)`
    });
  }

  return embed;
}
```

### Telegram Inline Keyboards

```javascript
// src/bot/telegram/keyboards.js
function createActionKeyboard(sessionName) {
  return {
    inline_keyboard: [
      [
        { text: '▶️ Start', callback_data: `start:${sessionName}` },
        { text: '⏸️ Stop', callback_data: `stop:${sessionName}` }
      ],
      [
        { text: '📝 Tasks', callback_data: `tasks:${sessionName}` },
        { text: '📊 Status', callback_data: `status:${sessionName}` }
      ],
      [
        { text: '💻 Code', url: `http://localhost:8083/${sessionName}` },
        { text: '🔗 Attach', url: `http://localhost:3131/attach/${sessionName}` }
      ]
    ]
  };
}
```

## Configuration & Setup

### Discord Bot Setup

1. **Create Discord Application:**
   - Go to https://discord.com/developers/applications
   - Click "New Application"
   - Navigate to "Bot" tab
   - Click "Add Bot"
   - Enable "Message Content Intent"
   - Copy bot token

2. **Invite Bot to Server:**
   - Go to OAuth2 > URL Generator
   - Select scopes: `bot`, `applications.commands`
   - Select permissions: `Send Messages`, `Read Messages`, `Embed Links`
   - Copy URL and open in browser
   - Select server and authorize

3. **Configure VibeManager:**
   ```bash
   export DISCORD_BOT_TOKEN="your_bot_token"
   export DISCORD_ALLOWED_USERS="user_id_1,user_id_2"
   ```

### Telegram Bot Setup

1. **Create Bot:**
   - Message @BotFather on Telegram
   - Send `/newbot`
   - Follow prompts to name your bot
   - Copy bot token

2. **Get User IDs:**
   - Message @userinfobot on Telegram
   - Copy your user ID
   - Share with allowed users to get their IDs

3. **Configure VibeManager:**
   ```bash
   export TELEGRAM_BOT_TOKEN="your_bot_token"
   export TELEGRAM_ALLOWED_USERS="123456789,987654321"
   ```

### VibeManager Configuration

Add to `~/.vibemanager/config.json`:
```json
{
  "bot": {
    "enabled": true,
    "platforms": {
      "discord": {
        "enabled": true,
        "token": "${DISCORD_BOT_TOKEN}",
        "allowedUsers": "${DISCORD_ALLOWED_USERS}"
      },
      "telegram": {
        "enabled": true,
        "token": "${TELEGRAM_BOT_TOKEN}",
        "allowedUsers": "${TELEGRAM_ALLOWED_USERS}"
      }
    },
    "notifications": {
      "taskComplete": true,
      "taskStuck": true,
      "errors": true,
      "dailySummary": false,
      "summaryTime": "09:00"
    },
    "ai": {
      "enabled": true,
      "provider": "anthropic",
      "model": "claude-3-5-sonnet-20241022"
    }
  }
}
```

## Testing Strategy

### Unit Tests
- Command parser logic
- PRD generation
- Intent detection
- Permission checking

### Integration Tests
- Mock Discord/Telegram clients
- Test command flows end-to-end
- Verify API interactions

### Manual Testing Checklist
- [ ] Bot connects to Discord
- [ ] Bot connects to Telegram
- [ ] Commands execute correctly
- [ ] Permissions enforced
- [ ] Notifications sent
- [ ] PRD generation works
- [ ] Natural language parsing works
- [ ] Rich embeds display correctly
- [ ] Inline keyboards work
- [ ] Error handling graceful

## Security Considerations

1. **Authentication:**
   - User whitelist enforced
   - Bot tokens stored securely
   - No public access without approval

2. **Rate Limiting:**
   - Prevent spam/abuse
   - Max 10 commands per minute per user

3. **Input Validation:**
   - Sanitize all user inputs
   - Prevent command injection
   - Validate session names, paths

4. **Permissions:**
   - Users can only access their sessions
   - Team workspaces isolated
   - Admin-only commands protected

## Rollout Plan

### Week 1: MVP Setup
- Setup Discord bot
- Setup Telegram bot
- Implement basic commands
- User whitelist auth

### Week 2: Core Commands
- Session management (/create, /start, /stop, /status)
- Task management (/tasks, /progress)
- Ralph control (/ralph start/pause/resume)

### Week 3: Notifications
- Task completion alerts
- Error notifications
- Stuck task warnings

### Week 4: AI Features
- Natural language intent detection
- PRD generation
- Status summaries

### Week 5: Polish & Testing
- Rich embeds (Discord)
- Inline keyboards (Telegram)
- Error handling
- Documentation

### Week 6: Beta Launch
- Internal testing
- Gather feedback
- Fix bugs
- Performance optimization

## Success Metrics

- **Engagement:** Daily active users sending commands
- **Adoption:** % of VibeManager users enabling bot
- **Retention:** Users still active after 30 days
- **Satisfaction:** User feedback and ratings
- **Performance:** Command response time < 2 seconds
- **Reliability:** 99.9% uptime for bot service

## Future Enhancements

### Additional Platforms
- Slack bot
- Microsoft Teams bot
- WhatsApp bot (via Clawdbot pattern)

### Voice Integration
- Discord voice channels
- Voice command execution
- Text-to-speech responses

### Video/Streaming
- Live stream Claude coding session
- Screen share in Discord voice channel
- Real-time code editor view

### Advanced AI Features
- Proactive suggestions ("I noticed task-2 is similar to what you built yesterday...")
- Automatic bug detection and fixing
- Code review feedback
- Security vulnerability scanning

### Analytics Dashboard
- Command usage statistics
- Most popular commands
- Peak usage times
- Error rates by command

## Documentation Deliverables

1. **BOT_SETUP.md** - Setup guide for Discord and Telegram
2. **BOT_COMMANDS.md** - Complete command reference
3. **BOT_API.md** - API documentation for bot service
4. **BOT_PERMISSIONS.md** - Permission model and workspace management
5. **BOT_TROUBLESHOOTING.md** - Common issues and solutions

## References

- [Clawdbot](https://clawd.bot/) - Multi-platform AI assistant
- [Clawdbot GitHub](https://github.com/clawdbot/clawdbot) - Open source implementation
- [claude-code-telegram](https://github.com/RichardAtCT/claude-code-telegram) - Claude Code via Telegram
- [discord.js Documentation](https://discord.js.org/) - Discord bot library
- [Telegraf Documentation](https://telegraf.js.org/) - Telegram bot framework
- [How to Use Claude Code From Your Phone](https://medium.com/@amirilovic/how-to-use-claude-code-from-your-phone-with-a-telegram-bot-dde2ac8783d0) - Telegram bot tutorial

---

**Status:** Planning Complete ✅
**Next Step:** Begin Phase 1 implementation - Core bot integration

**Estimated Timeline:** 6 weeks to beta launch
**Required Resources:**
- 1 backend developer
- 1 frontend developer (for bot embeds/UI)
- Access to Discord/Telegram for testing
- Claude API access for AI features
