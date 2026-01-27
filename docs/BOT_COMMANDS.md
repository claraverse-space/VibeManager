# VibeManager Bot - Command Reference

Complete reference for all bot commands available in Discord and Telegram.

## Table of Contents

- [Session Management](#session-management)
- [Task Management](#task-management)
- [Ralph Control](#ralph-control)
- [Monitoring](#monitoring)
- [Help](#help)

---

## Session Management

### `/create <name> [path]`

Create a new VibeManager session.

**Parameters:**
- `name` (required): Session name (alphanumeric, dashes, underscores)
- `path` (optional): Project path (defaults to `~/name`)

**Examples:**
```
/create my-blog
/create my-api ~/projects/api
/create dashboard /home/user/work/dashboard
```

**Response:**
- Session details
- Buttons: [▶️ Start] [📊 Status]

---

### `/start <name>`

Start a stopped session.

**Parameters:**
- `name` (required): Session name

**Examples:**
```
/start my-blog
/start dashboard
```

**Response:**
- Confirmation message
- Code editor URL
- Buttons: [⏸️ Stop] [🔄 Ralph] [📊 Status]

---

### `/stop <name>`

Stop a running session (preserves all data).

**Parameters:**
- `name` (required): Session name

**Examples:**
```
/stop my-blog
/stop dashboard
```

**Response:**
- Confirmation message
- Buttons: [▶️ Start Again] [📊 Status]

---

### `/delete <name>`

Permanently delete a session.

**Parameters:**
- `name` (required): Session name

**Examples:**
```
/delete old-project
/delete test-session
```

**Response:**
- Confirmation message

**Warning**: This cannot be undone!

---

### `/list`

List all sessions with status.

**Parameters:** None

**Examples:**
```
/list
```

**Response:**
- Total session count
- Running/stopped breakdown
- List of all sessions with status

---

### `/status [name]`

Show detailed status for a session, or all sessions if no name provided.

**Parameters:**
- `name` (optional): Session name

**Examples:**
```
/status
/status my-blog
```

**Response (single session):**
- Session name and path
- Running status
- Agent type
- Port number
- Ralph loop status
- Last updated time
- Buttons: [▶️/⏸️] [📝 Tasks] [🔄 Ralph]

**Response (all sessions):**
- Same as `/list`

---

### `/attach <name>`

Get terminal attachment URL for a session.

**Parameters:**
- `name` (required): Session name

**Examples:**
```
/attach my-blog
```

**Response:**
- Terminal URL
- Button: [🔗 Open Terminal]

---

### `/code <name>`

Get VS Code editor URL for a session.

**Parameters:**
- `name` (required): Session name

**Examples:**
```
/code my-blog
```

**Response:**
- Editor URL
- Button: [💻 Open Editor]

---

## Task Management

### `/task <session> <description...>`

Add a task to a session.

**Parameters:**
- `session` (required): Session name
- `description` (required): Task description (can be multiple words)

**Examples:**
```
/task my-blog Add user authentication
/task dashboard Implement dark mode toggle
/task api Create REST endpoints for posts
```

**Response:**
- Task confirmation
- Task ID
- Buttons: [🔄 Start Ralph] [📝 View All]

---

### `/tasks <session>`

List all tasks for a session.

**Parameters:**
- `session` (required): Session name

**Examples:**
```
/tasks my-blog
/tasks dashboard
```

**Response:**
- List of tasks with status icons
- Progress percentages
- Completion times
- Buttons: [📊 Progress] [🔄 Ralph]

**Status Icons:**
- ⏳ Pending
- 🔄 In Progress
- ✅ Completed
- 🔴 Blocked
- ❌ Error

---

### `/progress <session>`

Show detailed progress for the current task.

**Parameters:**
- `session` (required): Session name

**Examples:**
```
/progress my-blog
/progress dashboard
```

**Response:**
- Current task name
- Progress bar
- Progress percentage
- Current step
- Task steps with status
- Buttons: [📝 All Tasks] [⏸️ Pause]

---

## Ralph Control

Ralph is the autonomous coding loop that executes tasks automatically.

### `/ralph start <session>`

Start the Ralph autonomous loop for a session.

**Parameters:**
- `session` (required): Session name

**Examples:**
```
/ralph start my-blog
/ralph start dashboard
```

**Response:**
- Confirmation message
- Task queue info
- Buttons: [⏸️ Pause] [📊 Progress] [🛑 Stop]

**Note:** Session must have tasks to start Ralph.

---

### `/ralph pause <session>`

Pause the Ralph loop (keeps session running).

**Parameters:**
- `session` (required): Session name

**Examples:**
```
/ralph pause my-blog
```

**Response:**
- Confirmation message
- Current progress saved
- Buttons: [▶️ Resume] [📊 Status] [🛑 Stop]

---

### `/ralph resume <session>`

Resume a paused Ralph loop.

**Parameters:**
- `session` (required): Session name

**Examples:**
```
/ralph resume my-blog
```

**Response:**
- Confirmation message
- Buttons: [⏸️ Pause] [📊 Progress]

---

### `/ralph stop <session>`

Stop the Ralph loop completely.

**Parameters:**
- `session` (required): Session name

**Examples:**
```
/ralph stop my-blog
```

**Response:**
- Confirmation message
- Buttons: [📊 Status] [🔄 Start Again]

---

### `/ralph verify <session>`

Verify if a stuck task is actually complete.

**Parameters:**
- `session` (required): Session name

**Examples:**
```
/ralph verify my-blog
```

**Response:**
- Verification status
- Buttons: [📊 Progress] [🛑 Stop]

**Use case:** When Ralph detects a task is stuck, this command asks Claude if the task is actually complete (sometimes completion isn't detected properly).

---

## Monitoring

### `/logs <session> [lines]`

Get recent logs from a session (future feature).

**Parameters:**
- `session` (required): Session name
- `lines` (optional): Number of lines (default: 50)

**Examples:**
```
/logs my-blog
/logs dashboard 100
```

**Status:** Coming in Phase 2

---

### `/gpu`

Show GPU statistics (if available).

**Parameters:** None

**Examples:**
```
/gpu
```

**Response:**
- GPU utilization
- Memory usage
- Temperature
- Per-GPU breakdown (if multiple GPUs)

**Status:** Coming in Phase 2

---

## Help

### `/help [command]`

Show help for all commands or a specific command.

**Parameters:**
- `command` (optional): Command name to get help for

**Examples:**
```
/help
/help create
/help ralph
```

**Response:**
- Command list with descriptions
- Usage examples
- Parameter definitions

---

## Notifications

You'll automatically receive notifications for:

### 🎉 Task Completed

When Ralph finishes a task:
- Task name
- Duration
- Files changed
- Next task (if any)
- Buttons: [💻 View Code] [📊 Status] [⏸️ Pause]

### ⚠️ Task Stuck

When a task makes no progress for 3 iterations:
- Task name
- Current progress (frozen)
- Number of attempts
- Buttons: [🔍 Verify] [▶️ Resume] [🛑 Stop]

### 🎊 All Tasks Complete

When Ralph finishes all tasks:
- Total tasks completed
- Total duration
- Celebration message
- Buttons: [💻 View Code] [🗂️ New Project]

### 🚨 Session Error

When a session encounters an error:
- Error message
- Suggested fix
- Buttons: [📊 Status] [🛑 Stop]

---

## Quick Reference

**Create & Start:**
```
/create my-project
/start my-project
/task my-project Build feature X
/ralph start my-project
```

**Monitor Progress:**
```
/status my-project
/progress my-project
/tasks my-project
```

**Control Ralph:**
```
/ralph pause my-project
/ralph resume my-project
/ralph stop my-project
```

**Cleanup:**
```
/stop my-project
/delete my-project
```

---

## Tips & Tricks

### 1. Quick Status Check

Use `/status` (no arguments) to see all sessions at once.

### 2. Auto-Subscribe to Notifications

When you run any command on a session, you're automatically subscribed to notifications for that session.

### 3. Multiple Sessions

You can run multiple Ralph loops simultaneously on different sessions.

### 4. Button Shortcuts

Use the interactive buttons instead of typing commands - they're faster and prevent typos!

### 5. Session Names

Keep session names short and descriptive:
- ✅ Good: `api`, `blog`, `dashboard`
- ❌ Bad: `my-super-awesome-project-v2-final`

### 6. Task Descriptions

Be specific in task descriptions:
- ✅ Good: `Add JWT authentication with refresh tokens`
- ❌ Bad: `Fix auth`

---

## Platform Differences

### Discord

- Rich embeds with color coding
- Larger button labels
- Works in servers and DMs
- Slash commands auto-complete

### Telegram

- Inline keyboards
- Compact layout for mobile
- Deep links to external URLs
- Command menu in keyboard

Both platforms have the same commands and functionality!

---

## Error Messages

### Session Not Found

```
❌ Error
Session "xyz" not found

💡 Use /list to see available sessions
```

**Fix:** Check session name spelling or create it first.

### Missing Parameters

```
❌ Missing parameters: description

Usage: /task <session> <description...>
```

**Fix:** Provide all required parameters.

### Unauthorized

```
🚫 Access Denied

You're not authorized to use this bot.
Your Discord ID: 123456789012345678

Contact your VibeManager administrator.
```

**Fix:** Admin needs to add your user ID to ALLOWED_USERS.

### Session Already Exists

```
⚠️ Session Already Exists

A session named "my-blog" already exists.

Options:
• /start my-blog - Start it
• /delete my-blog - Remove it
```

**Fix:** Choose a different name or manage the existing session.

---

## Keyboard Shortcuts

### Discord

- `Ctrl+K` or `Cmd+K` - Quick search (find bot)
- `/` - Open slash commands
- `Esc` - Cancel command

### Telegram

- `/` - Open command menu
- Type command and `Tab` - Auto-complete
- Long-press button - Copy button action

---

## Advanced Usage

### Chaining Commands

Create and immediately start a session:

```
/create my-project
[Wait for response]
/start my-project
[Wait for response]
/task my-project Add user auth
[Wait for response]
/ralph start my-project
```

### Managing Multiple Projects

```
/create api
/create frontend
/create mobile

/task api Build REST endpoints
/task frontend Build React components
/task mobile Build Flutter screens

/ralph start api
/ralph start frontend
/ralph start mobile

[All three run in parallel!]
```

### Daily Workflow

**Morning:**
```
/status
[Check overnight progress]
```

**During Day:**
```
/create new-feature
/task new-feature Implement X, Y, Z
/ralph start new-feature
```

**Evening:**
```
/status new-feature
[Check if done]
/stop new-feature
```

---

## Troubleshooting Commands

If something seems stuck:

```
1. /status my-project
   [Check if session is running]

2. /progress my-project
   [Check task progress]

3. /ralph verify my-project
   [Ask Claude if task is complete]

4. /ralph stop my-project
   [Stop and restart if needed]
```

---

## See Also

- [BOT_SETUP.md](./BOT_SETUP.md) - Setup guide
- [BOT_UX_FLOW.md](./BOT_UX_FLOW.md) - UX flows and examples
- [README.md](../README.md) - VibeManager documentation

---

Made with ❤️ by the Claraverse team
