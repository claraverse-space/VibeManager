# Bot Configuration via UI

VibeManager now supports configuring Discord and Telegram bots directly through the web UI - no need to edit `.env` files!

## Features

- 🎨 **Web UI Configuration**: Configure bots through the settings page
- 💾 **Persistent Storage**: Configuration saved to `~/.vibemanager/bot-config.json`
- ✅ **Auto-Test**: Automatically sends test message when you save configuration
- 🔄 **Live Reload**: Bot service restarts automatically with new settings

## How to Configure

### 1. Access Settings Page

Visit the VibeManager dashboard and click the **🤖 Bot Settings** button, or navigate directly to:
```
http://localhost:3131/settings.html
```

### 2. Configure Telegram Bot

**Step 1: Get Bot Token**
1. Open Telegram and search for `@BotFather`
2. Send `/newbot` and follow the prompts
3. Copy the bot token (format: `123456:ABC-DEF...`)

**Step 2: Get Your User ID**
1. Search for `@userinfobot` in Telegram
2. Send any message to get your User ID (just the number)

**Step 3: Save Configuration**
1. Paste the **Bot Token** in the first field
2. Paste your **User ID** in the second field
3. Click **💾 Save & Test Connection**

**Step 4: Verify**
- You should see a success message in the UI
- Check your Telegram - you'll receive a test message from the bot
- Try `/help` to see available commands

### 3. Configure Discord Bot

**Step 1: Create Bot**
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to Bot → Add Bot
4. **Important**: Enable "MESSAGE CONTENT INTENT"
5. Copy the bot token

**Step 2: Get Your User ID**
1. In Discord, enable Developer Mode (Settings → Advanced → Developer Mode)
2. Right-click your username
3. Click "Copy User ID"

**Step 3: Save Configuration**
1. Paste the **Bot Token** in the first field
2. Paste your **User ID** in the second field
3. Click **💾 Save & Test Connection**

**Step 4: Verify**
- Check your Discord DMs for a test message from the bot
- Try `/help` to see available commands

## Configuration Storage

Configuration is stored in:
```
~/.vibemanager/bot-config.json
```

This file persists across restarts and doesn't require `.env` file editing.

## API Endpoint

The configuration endpoint is available at:
```
POST /api/bot/configure
```

**Request Body:**
```json
{
  "platform": "telegram",
  "token": "1234567890:ABCdefGHIjklMNOpqrsTUVwxyz",
  "allowedUsers": ["123456789"]
}
```

**Response:**
```json
{
  "success": true,
  "message": "✅ Bot configured successfully! Check your telegram for a test message."
}
```

## Bot Commands

Once configured, you can use these commands in Telegram or Discord:

### Session Management
- `/create <name>` - Create a new session
- `/start <name>` - Start a session
- `/stop <name>` - Stop a session
- `/list` - List all sessions
- `/status [name]` - Show session status

### Task Management
- `/task <session> <description>` - Add a task
- `/tasks <session>` - List tasks
- `/progress <session>` - Show current progress

### Ralph Control
- `/ralph start <session>` - Start autonomous loop
- `/ralph pause <session>` - Pause loop
- `/ralph resume <session>` - Resume loop
- `/ralph stop <session>` - Stop loop

### Utilities
- `/help` - Show all commands
- `/code <session>` - Get VS Code URL
- `/attach <session>` - Get terminal URL

## Notifications

The bot automatically sends notifications for:
- ✅ Task completion
- ⚠️ Tasks getting stuck
- 🎉 Ralph loop completion
- ❌ Session errors

## Troubleshooting

### Test Message Not Received

**Telegram:**
1. Make sure you started a conversation with the bot first
2. Search for your bot username in Telegram
3. Send `/start` to begin the conversation

**Discord:**
1. Make sure the bot has permission to DM you
2. Check your Privacy Settings allow DMs from server members
3. Verify MESSAGE CONTENT INTENT is enabled in the bot settings

### Bot Shows "Disconnected"

1. Check the token is correct
2. Verify network connectivity
3. For Telegram: ensure the token is valid (check with @BotFather)
4. For Discord: verify MESSAGE CONTENT INTENT is enabled

### Configuration Not Persisting

1. Check file permissions on `~/.vibemanager/`
2. Verify disk space is available
3. Check server logs for errors

## Security Notes

- Bot tokens are stored locally in `~/.vibemanager/bot-config.json`
- Tokens are never exposed in API responses (masked)
- Only whitelisted User IDs can use the bot commands
- No authentication required for the settings UI (runs locally)

## Advanced Configuration

The configuration file supports additional options:

```json
{
  "telegram": {
    "enabled": true,
    "token": "...",
    "allowedUsers": ["123456789"],
    "commandPrefix": "/"
  },
  "discord": {
    "enabled": true,
    "token": "...",
    "allowedUsers": ["987654321"],
    "commandPrefix": "/"
  },
  "notifications": {
    "taskComplete": true,
    "taskStuck": true,
    "sessionErrors": true,
    "ralphComplete": true
  },
  "rateLimit": {
    "maxCommandsPerMinute": 10,
    "maxCommandsPerHour": 100
  }
}
```

Edit this file to customize notification preferences and rate limits.
