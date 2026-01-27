# Telegram Bot User Guide

## Overview
The VibeManager Telegram bot allows you to control your AI coding sessions remotely and receive notifications when tasks complete - even while you sleep!

## Setup

### 1. Configure the Bot
The bot is configured in: `~/.vibemanager/bot-config.json`

Current configuration:
- Bot Token: Configured ✅
- Allowed Users: 1 user configured ✅

### 2. Test the Bot
Send `/start` to your bot to verify it's working. You should see a comprehensive welcome message with all available commands.

## All Available Commands

### Session Management
- `/create <name>` - Create a new session
- `/start <name>` - Start a session
- `/stop <name>` - Stop a session
- `/delete <name>` - Delete a session
- `/status [name]` - Show status of one or all sessions
- `/list` - List all sessions

### Task Management
- `/task <session> <description>` - Add a task to a session
- `/tasks <session>` - List all tasks in a session
- `/progress <session>` - Show current task progress
- `/prd <session> <description>` - Create a PRD for a session

### Ralph Control (Autonomous Loop)
- `/ralph start <session>` - Start the autonomous loop
- `/ralph pause <session>` - Pause the loop
- `/ralph resume <session>` - Resume the loop
- `/ralph stop <session>` - Stop the loop
- `/ralph verify <session>` - Verify if a stuck task is actually complete

### Monitoring
- `/logs <session> [lines]` - View recent logs (default: 50 lines)
- `/gpu` - Show GPU statistics
- `/attach <session>` - Get terminal attachment link
- `/code <session>` - Get VS Code editor link

### Help
- `/help [command]` - Show help for all commands or a specific command

## Background Execution

### How It Works
1. Create a session: `/create my-project`
2. Add tasks: `/task my-project Implement user authentication`
3. Start Ralph: `/ralph start my-project`
4. **Close the app and sleep!** 🌙

The bot will notify you when:
- ✅ Each task completes
- ⚠️ A task gets stuck
- 🎉 Ralph finishes all tasks

### Notifications
You'll receive automatic notifications with action buttons:
- View status
- View tasks
- Pause/Resume Ralph
- Stop Ralph

## Troubleshooting

### Commands showing "unknown command"

If you're seeing "unknown command" errors, try these steps:

1. **Restart the server**
   ```bash
   pkill -f "node server.js"
   cd ~/VibeManager
   node server.js
   ```

2. **Verify bot connection**
   Check the logs for:
   ```
   [Telegram] ✅ Connected and ready!
   [BotService] Telegram bot is ready
   ```

3. **Test command parsing**
   Run the test utility:
   ```bash
   node test-bot-commands.js
   ```

4. **Check for typos**
   - Commands must start with `/`
   - Session names are case-sensitive
   - Use quotes for multi-word descriptions: `/task my-project "add user auth"`

### Bot not responding

1. Check if the server is running:
   ```bash
   ps aux | grep "node server.js"
   ```

2. Check bot configuration:
   ```bash
   cat ~/.vibemanager/bot-config.json
   ```

3. Verify your user ID is in the allowed list

4. Check server logs:
   ```bash
   tail -f ~/VibeManager/server.log
   ```

## Examples

### Complete Workflow Example

```
# 1. Create a new project
/create my-app

# 2. Add tasks
/task my-app Create user authentication system
/task my-app Add database models
/task my-app Implement REST API

# 3. View tasks
/tasks my-app

# 4. Start autonomous loop
/ralph start my-app

# 5. Monitor progress
/progress my-app
/logs my-app

# 6. Check GPU usage
/gpu

# 7. Pause if needed
/ralph pause my-app

# 8. Resume when ready
/ralph resume my-app

# 9. Check final status
/status my-app
```

### Quick Commands

```
# Check all sessions
/status

# View recent logs
/logs my-project

# Check GPU
/gpu

# Emergency stop
/ralph stop my-project
```

## Tips

1. **Use descriptive session names**: `user-auth-feature` instead of `session1`
2. **Break down large tasks**: Multiple small tasks work better than one huge task
3. **Monitor regularly**: Use `/progress` to see what Ralph is doing
4. **Set notifications**: Make sure Telegram notifications are enabled on your device
5. **Keep tasks focused**: One feature or fix per task works best

## Support

If commands still don't work after following this guide:

1. Run diagnostics:
   ```bash
   cd ~/VibeManager
   node test-bot-commands.js
   ```

2. Check the GitHub issues: https://github.com/anthropics/claude-code/issues

3. Restart the server:
   ```bash
   pkill -f "node server.js" && node server.js
   ```

## Recent Fixes

✅ All commands now properly registered and working
✅ Background task execution fully functional
✅ Notifications working for task completion, stuck tasks, and Ralph completion
✅ Robust auto-reconnection for Telegram bot
✅ Comprehensive command help and error messages
