# Telegram Bot Commands

This document describes all available commands for the VibeManager Telegram bot.

## Session Management

- `/create <name> [path]` - Create a new coding session
  - Example: `/create my-app /home/user/projects/my-app`

- `/start <name>` - Start a session
  - Example: `/start my-app`

- `/stop <name>` - Stop a session
  - Example: `/stop my-app`

- `/delete <name>` - Delete a session
  - Example: `/delete my-app`

- `/list` - List all sessions

- `/status [name]` - Show session status (or all sessions if no name)
  - Example: `/status my-app`

- `/attach <name>` - Get terminal attachment link
  - Example: `/attach my-app`

- `/code <name>` - Get VS Code editor link
  - Example: `/code my-app`

## Task Management

- `/task <session> <description>` - Add a task to a session
  - Example: `/task my-app Add user authentication`

- `/tasks <session>` - List all tasks for a session
  - Example: `/tasks my-app`

- `/progress <session>` - Show current task progress
  - Example: `/progress my-app`

- `/prd <session> <description>` - Create a Product Requirements Document
  - Example: `/prd my-app Build a REST API for user management`

## Ralph Loop Control

Ralph is the autonomous coding loop that executes tasks while you're away.

- `/ralph start <session>` - Start Ralph autonomous loop
  - Example: `/ralph start my-app`

- `/ralph pause <session>` - Pause Ralph loop
  - Example: `/ralph pause my-app`

- `/ralph resume <session>` - Resume Ralph loop
  - Example: `/ralph resume my-app`

- `/ralph stop <session>` - Stop Ralph loop
  - Example: `/ralph stop my-app`

- `/ralph verify <session>` - Verify if a stuck task is actually complete
  - Example: `/ralph verify my-app`

## Monitoring

- `/logs <session> [lines]` - Get recent logs from a session
  - Example: `/logs my-app 50`
  - Default: 50 lines

- `/gpu` - Show GPU statistics
  - Works with NVIDIA, AMD, Intel, and Apple Silicon GPUs
  - Shows temperature, utilization, memory usage, and power draw

## Help

- `/help [command]` - Show help for all commands or a specific command
  - Example: `/help ralph`

## Background Task Execution

The bot is designed to let you start tasks and disconnect. When you:

1. Create a session: `/create my-project`
2. Add tasks: `/task my-project Implement feature X`
3. Start Ralph: `/ralph start my-project`

Ralph will autonomously work on your tasks, and the bot will notify you when:
- Tasks complete
- Tasks get stuck
- The entire project finishes

You can check progress anytime with `/status` or `/progress`, view logs with `/logs`, and monitor GPU usage with `/gpu`.

## Notifications

You'll automatically receive notifications for:
- ✅ Task completions
- ⚠️ Stuck tasks (when no progress after 3 iterations)
- 🎊 Project completion (all tasks done)
- ❌ Session errors

## Tips

1. **Use buttons** - Most command responses include interactive buttons for quick actions
2. **Monitor GPU** - Use `/gpu` to ensure your GPU is being utilized efficiently
3. **Check logs** - Use `/logs` to debug issues or see what's happening
4. **Background execution** - Start Ralph and disconnect - you'll get notified when done!
