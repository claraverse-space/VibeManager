# VibeManager Bot - UX Flow (Phase 1)

## Overview
This document shows the complete user experience flow for interacting with VibeManager through Discord and Telegram bots.

## User Journey Map

```
New User → Setup → First Session → Monitor Progress → Get Notifications → Advanced Usage
```

## Setup Flow

### 1. Bot Discovery & Setup

**User receives bot invite or finds bot**

**Discord:**
```
1. User clicks invite link
2. Discord asks: "Add VibeBot to your server?"
3. User selects server and clicks "Authorize"
4. Bot joins server
5. User goes to DMs or mentions @VibeBot in channel
```

**Telegram:**
```
1. User clicks bot link or searches @VibeManagerBot
2. User clicks "Start" button
3. Bot sends welcome message
```

### 2. First Interaction - Authorization Check

**If user is NOT whitelisted:**

**Discord:**
```
User: /status

VibeBot: 🚫 Access Denied

         You're not authorized to use this bot.
         Your Discord ID: 123456789012345678

         Contact your VibeManager administrator to get access.
         They need to add your ID to DISCORD_ALLOWED_USERS.
```

**Telegram:**
```
User: /status

VibeBot: 🚫 Access Denied

         You're not authorized to use this bot.
         Your Telegram ID: 123456789

         Contact your VibeManager administrator to get access.
         They need to add your ID to TELEGRAM_ALLOWED_USERS.
```

**If user IS whitelisted:**

**Discord:**
```
User: /help

VibeBot: 👋 Welcome to VibeManager Bot!

         🎯 What I can do:
         • Create and manage AI coding sessions
         • Start autonomous Ralph loops
         • Monitor task progress
         • Send notifications when tasks complete

         📚 Quick Start:
         /create my-project - Create a new session
         /status - Check all sessions
         /help - Show all commands

         🔗 Dashboard: http://localhost:3131
```

**Telegram:** (same content with inline keyboard)
```
VibeBot: 👋 Welcome to VibeManager Bot!

         🎯 What I can do:
         • Create and manage AI coding sessions
         • Start autonomous Ralph loops
         • Monitor task progress
         • Send notifications when tasks complete

         [📚 Show Commands] [🌐 Open Dashboard] [❓ Get Help]
```

## Core Workflows

### Workflow 1: Creating First Session

#### Step 1: Create Session

**User Input:**
```
/create my-blog
```

**Bot Response (Discord):**
```
VibeBot: ✅ Session Created

         📁 Name: my-blog
         📂 Path: /home/user/projects/my-blog
         🤖 Agent: claude-code
         ⚡ Status: Stopped
         🔌 Code Port: 8083

         What's next?
         • Use /start my-blog to launch the session
         • Use /task my-blog to add tasks
         • Use /ralph start my-blog to begin autonomous coding

         [▶️ Start Now] [📝 Add Task] [🔗 View Code]
```

**Bot Response (Telegram):** (similar with inline keyboard)
```
VibeBot: ✅ Session Created

         📁 Name: my-blog
         📂 Path: /home/user/projects/my-blog
         🤖 Agent: claude-code
         ⚡ Status: Stopped

         [▶️ Start] [📝 Tasks] [💻 Code] [🔗 Attach]
```

#### Step 2: Create with Custom Path

**User Input:**
```
/create my-api ~/dev/api-project
```

**Bot Response:**
```
VibeBot: ✅ Session Created

         📁 Name: my-api
         📂 Path: /home/user/dev/api-project
         🤖 Agent: claude-code
         ⚡ Status: Stopped
         🔌 Code Port: 8084

         [▶️ Start Now]
```

#### Step 3: Error Handling - Session Exists

**User Input:**
```
/create my-blog
```

**Bot Response:**
```
VibeBot: ⚠️ Session Already Exists

         A session named "my-blog" already exists.

         Options:
         • Use /start my-blog to start it
         • Use /delete my-blog to remove it first
         • Choose a different name

         [▶️ Start] [🗑️ Delete] [📊 Status]
```

### Workflow 2: Starting & Managing Sessions

#### Step 1: Start Session

**User Input:**
```
/start my-blog
```

**Bot Response (if stopped):**
```
VibeBot: 🚀 Starting Session...

         [3 seconds later]

VibeBot: ✅ Session Started

         📁 my-blog is now running!
         💻 Code Editor: http://localhost:8083
         🔗 Terminal: http://localhost:3131/attach/my-blog

         Ready to receive commands.

         [⏸️ Stop] [📝 Add Task] [🔄 Ralph Start]
```

**Bot Response (if already running):**
```
VibeBot: ℹ️ Already Running

         my-blog is already active.

         💻 Code: http://localhost:8083
         🔗 Attach: http://localhost:3131/attach/my-blog

         [⏸️ Stop] [📊 Status] [📝 Tasks]
```

#### Step 2: Check Status - Single Session

**User Input:**
```
/status my-blog
```

**Bot Response (Discord - Rich Embed):**
```
┌─────────────────────────────────┐
│   📊 my-blog                    │
│   ────────────────────────────  │
│                                 │
│   ⚡ Status: Running            │
│   📂 Path: ~/projects/my-blog   │
│   🤖 Agent: claude-code         │
│   🔌 Port: 8083                 │
│                                 │
│   🔄 Ralph: Active              │
│   📋 Current Task: "Setup DB"   │
│   📊 Progress: 45%              │
│   🔁 Iteration: 2/50            │
│                                 │
│   ⏱️ Last Update: 2 min ago     │
└─────────────────────────────────┘

[⏸️ Stop] [📝 Tasks] [💻 Code] [🔗 Attach]
```

**Bot Response (Telegram):**
```
VibeBot: 📊 my-blog

         ⚡ Status: Running
         📂 ~/projects/my-blog
         🤖 claude-code

         🔄 Ralph Active
         📋 Task: Setup DB (45%)
         🔁 Iteration: 2/50

         Updated 2m ago

         [⏸️ Stop] [📝 Tasks] [💻 Code]
         [🔗 Attach] [📊 Details]
```

#### Step 3: Check Status - All Sessions

**User Input:**
```
/status
```

**Bot Response (Discord - Multiple Embeds):**
```
VibeBot: 📊 All Sessions (3 active)

┌───────────────────────────┐
│ ✅ my-blog                │
│ Running | Ralph: 45%      │
│ Task: Setup DB            │
└───────────────────────────┘

┌───────────────────────────┐
│ ✅ my-api                 │
│ Running | Ralph: 80%      │
│ Task: Add endpoints       │
└───────────────────────────┘

┌───────────────────────────┐
│ ⏸️ old-project            │
│ Stopped                   │
└───────────────────────────┘

[🔄 Refresh] [📝 View Tasks]
```

#### Step 4: List All Sessions

**User Input:**
```
/list
```

**Bot Response:**
```
VibeBot: 📋 Sessions (5 total)

         ✅ my-blog (Running)
            Port: 8083 | Ralph: Active

         ✅ my-api (Running)
            Port: 8084 | Ralph: Active

         ⏸️ dashboard (Stopped)
            Port: 8085

         ⏸️ mobile-app (Stopped)
            Port: 8086

         ⏸️ landing (Stopped)
            Port: 8087

         [▶️ Start All Stopped] [🗑️ Clean Up]
```

#### Step 5: Stop Session

**User Input:**
```
/stop my-blog
```

**Bot Response:**
```
VibeBot: ⏸️ Stopping Session...

         [2 seconds later]

VibeBot: ✅ Session Stopped

         my-blog has been stopped.
         All progress is saved.

         [▶️ Start Again] [🗑️ Delete]
```

### Workflow 3: Working with Ralph

#### Step 1: Add Task Manually

**User Input:**
```
/task my-blog Setup database schema with users and posts tables
```

**Bot Response:**
```
VibeBot: ✅ Task Added

         📋 Task: Setup database schema
         📝 Description: Setup database schema with users and posts tables
         🆔 ID: task-1
         ⚡ Status: Pending

         Ralph will pick this up when started.

         [🔄 Start Ralph] [📝 Add Another] [📊 View All]
```

#### Step 2: Start Ralph Loop

**User Input:**
```
/ralph start my-blog
```

**Bot Response:**
```
VibeBot: 🚀 Starting Ralph Loop...

         [3 seconds later]

VibeBot: ✅ Ralph Started

         🔄 Autonomous loop is running!
         📋 3 tasks in queue
         🎯 Starting: "Setup database schema"

         I'll notify you when each task completes.

         [⏸️ Pause] [📊 Progress] [🛑 Stop]
```

#### Step 3: Monitor Progress

**User Input:**
```
/progress my-blog
```

**Bot Response (Discord - Rich Progress Bar):**
```
VibeBot: 📊 Ralph Progress

┌─────────────────────────────────┐
│   my-blog                       │
│                                 │
│   🔄 Ralph: Active              │
│   🔁 Iteration: 5/50            │
│                                 │
│   📋 Task 1: Setup DB           │
│   ████████████░░░░░░░░ 65%      │
│   ⏱️ 15 minutes elapsed          │
│                                 │
│   Current Step:                 │
│   ▶️ Writing migration files     │
│                                 │
│   Recent Activity:              │
│   ✅ Created models/User.js     │
│   ✅ Created models/Post.js     │
│   🔄 Running migrations...      │
│                                 │
│   📋 Queue: 2 tasks remaining   │
└─────────────────────────────────┘

[⏸️ Pause] [📝 All Tasks] [🛑 Stop]
```

**Bot Response (Telegram):**
```
VibeBot: 📊 my-blog Progress

         🔄 Ralph: Active (5/50)

         📋 Task 1: Setup DB
         Progress: [████░░] 65%
         Time: 15 minutes

         Current: Writing migrations

         Recent:
         ✅ Created User model
         ✅ Created Post model
         🔄 Running migrations

         Queue: 2 tasks left

         [⏸️ Pause] [📋 Tasks] [🛑 Stop]
```

#### Step 4: View All Tasks

**User Input:**
```
/tasks my-blog
```

**Bot Response:**
```
VibeBot: 📋 Tasks for my-blog

         ✅ Task 1: Setup project structure
            Completed 2 hours ago

         🔄 Task 2: Setup database schema
            In Progress (65%)
            Started 15 minutes ago

         ⏳ Task 3: Create API endpoints
            Pending - waiting for Task 2

         ⏳ Task 4: Write tests
            Pending

         [📊 Progress] [➕ Add Task]
```

#### Step 5: Pause Ralph

**User Input:**
```
/ralph pause my-blog
```

**Bot Response:**
```
VibeBot: ⏸️ Ralph Paused

         Autonomous loop paused.
         Current progress saved.

         📋 Last Task: Setup DB (65%)
         🔁 Iteration: 5/50

         [▶️ Resume] [🛑 Stop] [📊 Status]
```

#### Step 6: Resume Ralph

**User Input:**
```
/ralph resume my-blog
```

**Bot Response:**
```
VibeBot: ▶️ Ralph Resumed

         Continuing from where we left off...

         📋 Task: Setup DB (65%)
         🔁 Iteration: 6/50

         [⏸️ Pause] [📊 Progress]
```

### Workflow 4: Notifications

#### Notification 1: Task Completed

**Bot sends (without user prompt):**

**Discord:**
```
VibeBot: 🎉 Task Completed!

┌─────────────────────────────────┐
│   my-blog                       │
│                                 │
│   ✅ Setup database schema      │
│                                 │
│   ⏱️ Duration: 18 minutes        │
│   📝 Commits: 5 files changed   │
│   🔧 Changes:                   │
│      • Created User model       │
│      • Created Post model       │
│      • Added migrations         │
│                                 │
│   🎯 Next: Create API endpoints │
└─────────────────────────────────┘

Ralph is continuing to the next task...

[💻 View Code] [📊 Status] [⏸️ Pause]
```

**Telegram:**
```
VibeBot: 🎉 Task Complete!

         my-blog

         ✅ Setup database schema

         Duration: 18 minutes
         Commits: 5 files changed

         Changes:
         • Created User model
         • Created Post model
         • Added migrations

         🎯 Next: API endpoints

         [💻 Code] [📊 Status] [⏸️ Pause]
```

#### Notification 2: Task Stuck

**Bot sends:**
```
VibeBot: ⚠️ Task Stuck

         my-blog

         🔴 Task: Create API endpoints
         📊 Progress: 45% (no change)
         🔁 Attempts: 3 iterations

         Last action: "Installing express"

         This might need your attention.

         [🔍 Verify] [▶️ Force Resume] [📋 Logs] [🛑 Stop]
```

#### Notification 3: Session Error

**Bot sends:**
```
VibeBot: 🚨 Error in my-blog

         ❌ Task: Create API endpoints

         Error: ModuleNotFoundError
         No module named 'express'

         💡 Suggested Fix:
         Run: npm install express

         [🔧 Auto-Fix] [📋 View Logs] [🛑 Stop]
```

#### Notification 4: All Tasks Complete

**Bot sends:**
```
VibeBot: 🎊 All Tasks Complete!

         my-blog

         ✅ 4/4 tasks completed
         ⏱️ Total time: 2 hours 15 minutes
         📝 Total commits: 18
         🔧 Files changed: 47

         Tasks:
         ✅ Setup project structure
         ✅ Setup database schema
         ✅ Create API endpoints
         ✅ Write tests

         Your project is ready! 🚀

         [💻 View Code] [🔗 Open Dashboard] [🗂️ New Project]
```

### Workflow 5: Error Handling

#### Error 1: Session Not Found

**User Input:**
```
/status nonexistent
```

**Bot Response:**
```
VibeBot: ❌ Session Not Found

         No session named "nonexistent"

         Available sessions:
         • my-blog
         • my-api
         • dashboard

         Use /list to see all sessions.

         [📋 List All] [➕ Create New]
```

#### Error 2: Missing Parameters

**User Input:**
```
/create
```

**Bot Response:**
```
VibeBot: ⚠️ Missing Parameter

         Usage: /create <name> [path]

         Example:
         /create my-project
         /create my-project ~/dev/my-project

         [❓ Help] [📚 Commands]
```

#### Error 3: Invalid Action

**User Input:**
```
/start my-blog
```

**(If path doesn't exist)**

**Bot Response:**
```
VibeBot: ❌ Cannot Start Session

         Path doesn't exist:
         /home/user/projects/my-blog

         Options:
         • Create the directory first
         • Delete and recreate with correct path
         • Edit session configuration

         [🗑️ Delete] [📝 Edit] [❓ Help]
```

#### Error 4: Ralph Already Running

**User Input:**
```
/ralph start my-blog
```

**(If already running)**

**Bot Response:**
```
VibeBot: ℹ️ Ralph Already Running

         Autonomous loop is already active.

         📋 Current Task: API endpoints (45%)
         🔁 Iteration: 8/50

         [⏸️ Pause] [📊 Progress] [🛑 Stop]
```

## Advanced Interactions

### Multi-Session Management

**User Input:**
```
/status
```

**Bot Response (when multiple sessions active):**
```
VibeBot: 📊 Session Overview

         🟢 3 Running | ⚪ 2 Stopped

         ✅ my-blog (Running)
            Ralph: Task 2/4 (65%)
            "Setup database"

         ✅ my-api (Running)
            Ralph: Task 5/7 (71%)
            "Add authentication"

         ✅ dashboard (Running)
            Ralph: Task 1/3 (20%)
            "Setup React"

         ⏸️ mobile-app (Stopped)

         ⏸️ landing (Stopped)

         [📊 Details] [⏸️ Stop All] [🔄 Refresh]
```

### Quick Actions (Button Interactions)

#### Discord: Button Click Flow

**Initial Message:**
```
[User clicks "View Code" button on session status]
```

**Bot Response:**
```
VibeBot: 💻 Opening Code Editor...

         my-blog
         http://localhost:8083

         [Link sent to browser]
```

#### Telegram: Inline Keyboard Flow

**Initial Message:**
```
[User clicks "Tasks" button]
```

**Bot Updates Message:**
```
VibeBot: 📋 Tasks for my-blog

         ✅ Setup project (done)
         🔄 Setup DB (65%)
         ⏳ API endpoints (pending)

         [◀️ Back] [📊 Progress] [➕ Add]
```

### Help System

**User Input:**
```
/help
```

**Bot Response:**
```
VibeBot: 📚 Command Reference

         🎯 Sessions
         /create <name> [path] - Create session
         /start <name> - Start session
         /stop <name> - Stop session
         /delete <name> - Delete session
         /list - List all sessions
         /status [name] - Show status

         🔄 Ralph Control
         /ralph start <name> - Start loop
         /ralph pause <name> - Pause loop
         /ralph resume <name> - Resume loop
         /ralph stop <name> - Stop loop

         📋 Tasks
         /task <name> <desc> - Add task
         /tasks <name> - List tasks
         /progress <name> - Show progress

         💡 Tips
         • You'll get notified when tasks complete
         • Use buttons for quick actions
         • Sessions persist across restarts

         [🌐 Dashboard] [❓ Get Help]
```

## Platform-Specific Features

### Discord Features

1. **Rich Embeds**: Color-coded status, progress bars, timestamps
2. **Action Buttons**: Quick actions below messages
3. **Server vs DM**: Works in both server channels and DMs
4. **@Mentions**: Can mention bot in channels
5. **Slash Commands**: Native Discord command UI

### Telegram Features

1. **Inline Keyboards**: Interactive buttons on messages
2. **Callback Queries**: Buttons update messages in-place
3. **Deep Links**: Direct links to code editor and terminal
4. **Bot Commands Menu**: Commands shown in keyboard
5. **Message Editing**: Updates progress in same message

## Performance & UX Considerations

### Response Times
- Command acknowledgment: < 500ms
- Session creation: < 3 seconds
- Status check: < 1 second
- Notifications: < 2 seconds after event

### Message Updates
- Discord: New messages for each update (embeds can't be edited easily)
- Telegram: Edit existing message for status updates (cleaner UX)

### Error Recovery
- All errors show clear error message + suggested action
- Always provide "what to do next" buttons
- Never leave user stuck without options

### Accessibility
- Emojis for quick visual scanning
- Clear text descriptions (screen reader friendly)
- Consistent formatting across platforms
- Button labels are action-oriented (verb-first)

## User Personas & Typical Flows

### Persona 1: Solo Developer (Sarah)

**Morning Routine:**
```
8:00 AM - On phone, checking overnight work
Sarah: /status

VibeBot: 🎊 All tasks complete!
         my-blog finished 2 hours ago
         [View Code]

Sarah: [clicks View Code, reviews on phone]
Sarah: Looks good! Time for a new project.

Sarah: /create my-dashboard ~/projects/dashboard
VibeBot: ✅ Session created

Sarah: /task my-dashboard Build admin dashboard with user management
VibeBot: ✅ Task added

Sarah: /ralph start my-dashboard
VibeBot: 🚀 Ralph started!
```

### Persona 2: Team Lead (Marcus)

**Coordinating Team Work:**
```
[In Discord #dev-team channel]

Marcus: /status

VibeBot: 📊 All Sessions (5 active)
         [Shows all team sessions]

Marcus: Everyone's making good progress.
        @VibeBot /status auth-service

VibeBot: [Shows detailed status]

Marcus: Looks like auth-service is stuck.
        /ralph verify auth-service

VibeBot: 🔍 Verifying task...
         ✅ Task is actually complete!
         Moving to next task.
```

### Persona 3: Freelancer (Alex)

**Client Work Flow:**
```
[Client messages on WhatsApp: "Can you add dark mode?"]

[Alex opens Telegram]
Alex: /task client-website Add dark mode with system preference

VibeBot: ✅ Task added to client-website

[20 minutes later]
VibeBot: 🎉 Task complete!
         Dark mode is live

Alex: [Forwards notification to client]
Client: Perfect! Thanks!
```

## State Diagram

```
┌─────────────┐
│   Start     │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│  Bot Receives   │
│    Command      │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐         ┌──────────────┐
│  Check Auth     │────────▶│ Unauthorized │
└──────┬──────────┘         └──────────────┘
       │ Authorized
       ▼
┌─────────────────┐
│  Parse Command  │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐         ┌──────────────┐
│  Validate Args  │────────▶│ Show Error   │
└──────┬──────────┘         │ + Help Text  │
       │ Valid              └──────────────┘
       ▼
┌─────────────────┐
│  Call API       │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐         ┌──────────────┐
│  Format Result  │◀────────│  API Error   │
└──────┬──────────┘         └──────────────┘
       │ Success
       ▼
┌─────────────────┐
│  Send Response  │
│  with Actions   │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│  User Clicks    │
│    Button?      │
└──────┬──────────┘
       │ Yes
       └──────────┐
                  │
                  ▼
         ┌─────────────────┐
         │  Handle Action  │
         │  (repeat flow)  │
         └─────────────────┘
```

## Next Steps

After Phase 1 is complete, users will be able to:
✅ Create and manage sessions from phone
✅ Start Ralph loops remotely
✅ Monitor progress in real-time
✅ Get notifications when tasks complete
✅ Access code editor and terminal via links
✅ Handle errors and stuck tasks

This creates a complete mobile-first development workflow!
