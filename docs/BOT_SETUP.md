# VibeManager Bot Setup Guide

Complete guide to setting up Discord and Telegram bots for VibeManager.

## Prerequisites

- VibeManager installed and running
- Discord account (for Discord bot)
- Telegram account (for Telegram bot)

## Discord Bot Setup

### Step 1: Create Discord Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application"
3. Enter a name (e.g., "VibeManager Bot")
4. Click "Create"

### Step 2: Create Bot User

1. In your application, go to the "Bot" tab
2. Click "Add Bot"
3. Click "Yes, do it!"
4. Under "Privileged Gateway Intents", enable:
   - ✅ MESSAGE CONTENT INTENT
5. Click "Reset Token" and copy your bot token
   - **Important**: Save this token securely, you'll need it later

### Step 3: Invite Bot to Server

1. Go to "OAuth2" > "URL Generator"
2. Under "Scopes", select:
   - ✅ `bot`
   - ✅ `applications.commands`
3. Under "Bot Permissions", select:
   - ✅ Send Messages
   - ✅ Read Messages/View Channels
   - ✅ Embed Links
   - ✅ Attach Files
   - ✅ Read Message History
4. Copy the generated URL
5. Open the URL in your browser
6. Select your server
7. Click "Authorize"

### Step 4: Get Your Discord User ID

1. Open Discord
2. Go to User Settings (gear icon)
3. Go to "Advanced"
4. Enable "Developer Mode"
5. Right-click your username
6. Click "Copy User ID"

### Step 5: Configure VibeManager

Add to your environment variables or `.env` file:

```bash
DISCORD_BOT_TOKEN=your_bot_token_here
DISCORD_ALLOWED_USERS=your_user_id_here
```

**Multiple users:**
```bash
DISCORD_ALLOWED_USERS=123456789012345678,987654321098765432,555666777888999000
```

---

## Telegram Bot Setup

### Step 1: Create Bot

1. Open Telegram
2. Search for [@BotFather](https://t.me/BotFather)
3. Start a chat and send `/newbot`
4. Follow the prompts:
   - Enter your bot's display name (e.g., "VibeManager Bot")
   - Enter your bot's username (e.g., "vibemanager_bot")
     - Must end in "bot"
     - Must be unique
5. Copy the bot token provided
   - **Important**: Save this token securely

### Step 2: Get Your Telegram User ID

**Method 1: Using @userinfobot**
1. Search for [@userinfobot](https://t.me/userinfobot) in Telegram
2. Start a chat
3. Your user ID will be displayed

**Method 2: Using @getidsbot**
1. Search for [@getidsbot](https://t.me/getidsbot) in Telegram
2. Send any message
3. Your user ID will be shown

### Step 3: Configure VibeManager

Add to your environment variables or `.env` file:

```bash
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_ALLOWED_USERS=your_user_id_here
```

**Multiple users:**
```bash
TELEGRAM_ALLOWED_USERS=123456789,987654321,555666777
```

### Step 4: Start Your Bot

1. Search for your bot username in Telegram
2. Click "Start"
3. You should see a welcome message

---

## Configuration File

### Environment Variables

Create or edit `~/.vibemanager/.env`:

```bash
# VibeManager Core
PORT=3131
CODE_PORT=8083

# Discord Bot
DISCORD_BOT_TOKEN=MTA1234567890.ABCDEF.xyz123abc456def789
DISCORD_ALLOWED_USERS=123456789012345678,987654321098765432

# Telegram Bot
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz123456789
TELEGRAM_ALLOWED_USERS=123456789,987654321

# Bot Settings (optional)
BOT_ENABLED=true
BOT_COMMAND_PREFIX=/
```

### Loading Environment Variables

VibeManager automatically loads environment variables. You can also set them in your shell:

```bash
export DISCORD_BOT_TOKEN="your_token_here"
export DISCORD_ALLOWED_USERS="123456789012345678"
export TELEGRAM_BOT_TOKEN="your_token_here"
export TELEGRAM_ALLOWED_USERS="123456789"
```

---

## Testing Your Setup

### Discord

1. Open Discord
2. Go to your server (or DM the bot)
3. Send: `/help`
4. You should see the command list

**Test commands:**
```
/list
/help
```

### Telegram

1. Open Telegram
2. Find your bot
3. Send: `/help`
4. You should see the command list

**Test commands:**
```
/start
/help
/list
```

---

## Troubleshooting

### Discord Bot Not Responding

**Issue**: Bot appears offline
- **Solution**: Check that the bot token is correct
- **Solution**: Ensure MESSAGE CONTENT INTENT is enabled

**Issue**: "Unauthorized" message
- **Solution**: Verify your Discord user ID is in DISCORD_ALLOWED_USERS
- **Solution**: Make sure you're using the correct User ID (not username)

**Issue**: Bot joined but can't read messages
- **Solution**: Check bot permissions in server settings
- **Solution**: Ensure bot has "Read Messages" permission in the channel

### Telegram Bot Not Responding

**Issue**: Bot not responding to commands
- **Solution**: Check that the bot token is correct
- **Solution**: Make sure you clicked "Start" on the bot

**Issue**: "Unauthorized" message
- **Solution**: Verify your Telegram user ID is in TELEGRAM_ALLOWED_USERS
- **Solution**: User IDs are numbers, not usernames

**Issue**: Bot shows "Bot was blocked by the user"
- **Solution**: Search for your bot again and click "Start"

### General Issues

**Issue**: Bot not starting
- **Check logs**: Look for errors in VibeManager logs
- **Verify tokens**: Ensure both tokens are correct
- **Check internet**: Bots need internet connection

**Issue**: Environment variables not loaded
- **Solution**: Restart VibeManager after setting variables
- **Solution**: Check variable names (case-sensitive)
- **Solution**: Ensure no spaces around `=` in .env file

**Issue**: Can't find bot in Discord/Telegram
- **Discord**: Use the invite URL from OAuth2 settings
- **Telegram**: Search for the exact bot username (e.g., @vibemanager_bot)

---

## Security Best Practices

### Token Security

1. **Never commit tokens to git**
   - Add `.env` to `.gitignore`
   - Use environment variables

2. **Regenerate if exposed**
   - If token is leaked, regenerate immediately
   - Discord: Bot settings > Reset Token
   - Telegram: @BotFather > /revoke

3. **Restrict permissions**
   - Only grant necessary bot permissions
   - Use user whitelist (ALLOWED_USERS)

### User Access Control

1. **Whitelist users**
   - Only add trusted users to ALLOWED_USERS
   - Remove users when they leave team

2. **Monitor usage**
   - Check VibeManager logs for unauthorized attempts
   - Review active sessions regularly

3. **Private servers**
   - Use private Discord servers
   - Don't share bot invite links publicly

---

## Advanced Configuration

### Custom Command Prefix

Default prefix is `/`, but you can change it:

```bash
BOT_COMMAND_PREFIX=!
```

Now commands are `!create`, `!start`, etc.

### Disable Specific Platform

**Disable Discord:**
```bash
# Remove or comment out
# DISCORD_BOT_TOKEN=...
```

**Disable Telegram:**
```bash
# Remove or comment out
# TELEGRAM_BOT_TOKEN=...
```

### No Whitelist (Allow All Users)

**WARNING**: This allows ANYONE to control your VibeManager!

```bash
# Leave empty or omit entirely
DISCORD_ALLOWED_USERS=
TELEGRAM_ALLOWED_USERS=
```

Only do this on private, trusted networks.

---

## Multiple Bots (Advanced)

You can run multiple VibeManager instances with different bots:

### Instance 1 (Production)
```bash
PORT=3131
DISCORD_BOT_TOKEN=production_token
DISCORD_ALLOWED_USERS=team_users
```

### Instance 2 (Development)
```bash
PORT=3132
DISCORD_BOT_TOKEN=dev_token
DISCORD_ALLOWED_USERS=dev_users
```

---

## Getting Help

### Check Logs

```bash
# VibeManager logs
journalctl --user -u vibemanager -f

# Or if running manually
tail -f ~/.vibemanager/server.log
```

### Common Log Messages

```
[Discord] Connected as VibeBot#1234
✅ Discord bot is working

[Telegram] Connected
✅ Telegram bot is working

[BotService] Initialized
✅ Bot service is running

[Discord] No token provided, skipping Discord bot
ℹ️ Discord is disabled (no token)
```

### Support

- **GitHub Issues**: [Report bugs](https://github.com/claraverse-space/VibeManager/issues)
- **Documentation**: [Full docs](https://github.com/claraverse-space/VibeManager/wiki)
- **Command Reference**: See [BOT_COMMANDS.md](./BOT_COMMANDS.md)

---

## Next Steps

Once your bots are set up:

1. **Create your first session**: `/create my-project`
2. **Add tasks**: `/task my-project Build something cool`
3. **Start Ralph**: `/ralph start my-project`
4. **Get notifications**: Bot will notify you when tasks complete!

See [BOT_COMMANDS.md](./BOT_COMMANDS.md) for complete command reference.

---

Made with ❤️ by the Claraverse team
