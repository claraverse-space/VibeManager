# Quick Start: Connect Discord/Telegram Bots (5 minutes)

This guide walks you through connecting Discord and Telegram bots to your VibeManager instance.

## Current Status Check

Your VibeManager is running on port 3131, but bots need setup first!

**What you need:**
- 5 minutes
- Discord account (for Discord bot)
- Telegram account (for Telegram bot)
- VibeManager running (✅ you have this!)

---

## Option 1: Discord Bot (Recommended for Teams)

### Step 1: Create Discord Bot (2 minutes)

1. **Go to Discord Developer Portal**
   - Open: https://discord.com/developers/applications
   - Click "New Application"
   - Name it: `VibeManager Bot`
   - Click "Create"

2. **Add Bot User**
   - Click "Bot" tab (left sidebar)
   - Click "Add Bot" → "Yes, do it!"

3. **Enable Message Content**
   - Scroll down to "Privileged Gateway Intents"
   - ✅ Enable "MESSAGE CONTENT INTENT"
   - Click "Save Changes"

4. **Get Bot Token**
   - Click "Reset Token" → "Yes, do it!"
   - Click "Copy" to copy the token
   - **Save this somewhere safe!** You'll need it in Step 3

### Step 2: Invite Bot to Your Server (1 minute)

1. **Generate Invite URL**
   - Click "OAuth2" → "URL Generator" (left sidebar)
   - Under "Scopes", check:
     - ✅ `bot`
   - Under "Bot Permissions", check:
     - ✅ Send Messages
     - ✅ Read Messages/View Channels
     - ✅ Embed Links

2. **Copy & Open URL**
   - Scroll down and copy the "Generated URL"
   - Open it in your browser
   - Select your Discord server
   - Click "Authorize"

3. **Get Your User ID**
   - Open Discord
   - Settings → Advanced → Enable "Developer Mode"
   - Right-click your username → "Copy User ID"
   - **Save this ID!** You'll need it in Step 3

### Step 3: Configure VibeManager (1 minute)

```bash
# Set environment variables
export DISCORD_BOT_TOKEN="paste_your_bot_token_here"
export DISCORD_ALLOWED_USERS="paste_your_user_id_here"

# Restart VibeManager
pkill node
node server.js > server.log 2>&1 &

# Check logs
tail -f server.log
```

**Look for this in logs:**
```
[Discord] Connecting...
[Discord] Connected as VibeBot#1234
[BotService] Initialized
```

### Step 4: Test It! (30 seconds)

1. Open Discord
2. Go to your server (or DM the bot)
3. Type: `/help`
4. You should see the command list!

**Try this:**
```
/list
/create test-project
/status test-project
```

✅ **Discord bot is working!**

---

## Option 2: Telegram Bot (Recommended for Mobile)

### Step 1: Create Telegram Bot (2 minutes)

1. **Open Telegram**
   - Search for: `@BotFather`
   - Start chat

2. **Create Bot**
   - Send: `/newbot`
   - Enter display name: `VibeManager Bot`
   - Enter username: `your_vibemanager_bot` (must end in "bot")
   - **Copy the token** BotFather gives you
   - **Save this token!** You'll need it in Step 3

### Step 2: Get Your User ID (30 seconds)

1. **Search for: `@userinfobot`**
   - Start chat
   - Your user ID will be shown
   - **Save this ID!** You'll need it in Step 3

### Step 3: Configure VibeManager (1 minute)

```bash
# Set environment variables
export TELEGRAM_BOT_TOKEN="paste_your_bot_token_here"
export TELEGRAM_ALLOWED_USERS="paste_your_user_id_here"

# Restart VibeManager
pkill node
node server.js > server.log 2>&1 &

# Check logs
tail -f server.log
```

**Look for this in logs:**
```
[Telegram] Connecting...
[Telegram] Connected
[BotService] Initialized
```

### Step 4: Test It! (30 seconds)

1. Open Telegram
2. Search for your bot username (e.g., `@your_vibemanager_bot`)
3. Click "Start"
4. You should see welcome message!

**Try this:**
```
/start
/list
/create test-project
```

✅ **Telegram bot is working!**

---

## Option 3: Both Bots (Best Experience!)

Just combine the environment variables:

```bash
# Discord
export DISCORD_BOT_TOKEN="your_discord_token"
export DISCORD_ALLOWED_USERS="your_discord_user_id"

# Telegram
export TELEGRAM_BOT_TOKEN="your_telegram_token"
export TELEGRAM_ALLOWED_USERS="your_telegram_user_id"

# Restart
pkill node
node server.js > server.log 2>&1 &
```

Now you can control VibeManager from **both** Discord and Telegram!

---

## Permanent Setup (Recommended)

### Create .env file

Instead of exporting variables every time, create a `.env` file:

```bash
# Create .env file
cat > ~/.vibemanager/.env << 'EOF'
# Discord Bot
DISCORD_BOT_TOKEN=your_discord_bot_token_here
DISCORD_ALLOWED_USERS=your_discord_user_id_here

# Telegram Bot
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
TELEGRAM_ALLOWED_USERS=your_telegram_user_id_here

# VibeManager
PORT=3131
CODE_PORT=8083
EOF
```

### Load .env automatically

Add to your shell profile (`~/.bashrc` or `~/.zshrc`):

```bash
# Load VibeManager environment
if [ -f ~/.vibemanager/.env ]; then
  export $(grep -v '^#' ~/.vibemanager/.env | xargs)
fi
```

Then reload:
```bash
source ~/.bashrc  # or source ~/.zshrc
```

---

## Troubleshooting

### "Bot not responding"

**Check logs:**
```bash
tail -f server.log | grep -E "(Discord|Telegram|BotService)"
```

**Should see:**
```
[Discord] Connected as VibeBot#1234
[Telegram] Connected
[BotService] Initialized
```

**If you see "No token provided, skipping":**
- Environment variables not set
- Run `env | grep DISCORD` to verify
- Make sure you exported variables in current shell
- Restart VibeManager after setting variables

### "Unauthorized" message

Your User ID is not in ALLOWED_USERS:

```bash
# Add your user ID
export DISCORD_ALLOWED_USERS="123456789012345678"
# or for Telegram
export TELEGRAM_ALLOWED_USERS="123456789"

# Restart
pkill node && node server.js > server.log 2>&1 &
```

### "Discord bot offline"

1. Check "MESSAGE CONTENT INTENT" is enabled
2. Verify bot token is correct
3. Check bot was invited to server
4. Check logs for connection errors

### "Telegram bot not starting"

1. Make sure you clicked "Start" on the bot
2. Verify bot token is correct
3. User ID should be a number, not @username
4. Check logs for errors

---

## Test Commands

Once bots are connected, try these:

```
/help                                  # Show commands
/list                                  # List sessions
/create my-test                        # Create session
/task my-test Build something cool     # Add task
/ralph start my-test                   # Start Ralph
/status my-test                        # Check status
```

---

## Multiple Users

### Add Team Members

**Discord:**
```bash
# Get each user's Discord ID (right-click → Copy User ID)
export DISCORD_ALLOWED_USERS="user1_id,user2_id,user3_id"
```

**Telegram:**
```bash
# Get each user's Telegram ID (@userinfobot)
export TELEGRAM_ALLOWED_USERS="user1_id,user2_id,user3_id"
```

Example:
```bash
export DISCORD_ALLOWED_USERS="123456789012345678,987654321098765432,555666777888999000"
export TELEGRAM_ALLOWED_USERS="123456789,987654321,555666777"
```

---

## Security Notes

⚠️ **Important:**
- **Never commit bot tokens to git**
- **Add `.env` to `.gitignore`**
- **Regenerate tokens if exposed**
- **Only whitelist trusted users**

✅ **Recommended:**
- Use private Discord servers
- Don't share bot invite links publicly
- Review ALLOWED_USERS regularly
- Check logs for unauthorized attempts

---

## Next Steps

✅ **Bots working?** Great! Now try:

1. **Create session from mobile:**
   ```
   /create my-project
   /task my-project Add user authentication
   /ralph start my-project
   ```

2. **Get notifications:**
   - Bot will notify you when tasks complete
   - Check status anytime with `/status`

3. **Read full docs:**
   - [BOT_COMMANDS.md](./BOT_COMMANDS.md) - All commands
   - [BOT_UX_FLOW.md](./BOT_UX_FLOW.md) - UX examples
   - [BOT_SETUP.md](./BOT_SETUP.md) - Detailed setup

---

## Quick Reference

### Environment Variables
```bash
DISCORD_BOT_TOKEN=your_token
DISCORD_ALLOWED_USERS=your_user_id
TELEGRAM_BOT_TOKEN=your_token
TELEGRAM_ALLOWED_USERS=your_user_id
```

### Restart VibeManager
```bash
pkill node
node server.js > server.log 2>&1 &
```

### Check Status
```bash
tail -f server.log
ps aux | grep "node server.js"
curl http://localhost:3131/api/health
```

### Test Bots
```
Discord/Telegram:
/help
/list
/create test
```

---

**Need help?** See [BOT_SETUP.md](./BOT_SETUP.md) for detailed troubleshooting.

Made with ❤️ by the Claraverse team
