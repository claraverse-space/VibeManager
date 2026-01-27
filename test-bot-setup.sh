#!/bin/bash
# test-bot-setup.sh - Verify bot setup and connection

echo "🤖 VibeManager Bot Setup Test"
echo "=============================="
echo ""

# Check if VibeManager is running
echo "1. Checking if VibeManager is running..."
if pgrep -f "node.*server.js" > /dev/null; then
    echo "   ✅ VibeManager is running"
    PID=$(pgrep -f "node.*server.js")
    echo "   PID: $PID"
else
    echo "   ❌ VibeManager is NOT running"
    echo "   Start it with: node server.js > server.log 2>&1 &"
    exit 1
fi
echo ""

# Check API health
echo "2. Checking API health..."
if curl -s http://localhost:3131/api/health > /dev/null; then
    echo "   ✅ VibeManager API is responding"
    HEALTH=$(curl -s http://localhost:3131/api/health)
    echo "   $HEALTH"
else
    echo "   ❌ API not responding on port 3131"
    exit 1
fi
echo ""

# Check environment variables
echo "3. Checking bot environment variables..."

DISCORD_OK=false
TELEGRAM_OK=false

if [ -n "$DISCORD_BOT_TOKEN" ]; then
    echo "   ✅ DISCORD_BOT_TOKEN is set"
    TOKEN_LEN=${#DISCORD_BOT_TOKEN}
    echo "      Token length: $TOKEN_LEN characters"
    DISCORD_OK=true
else
    echo "   ⚠️  DISCORD_BOT_TOKEN not set"
    echo "      Set with: export DISCORD_BOT_TOKEN='your_token'"
fi

if [ -n "$DISCORD_ALLOWED_USERS" ]; then
    echo "   ✅ DISCORD_ALLOWED_USERS is set"
    echo "      Users: $DISCORD_ALLOWED_USERS"
else
    echo "   ⚠️  DISCORD_ALLOWED_USERS not set"
    echo "      Set with: export DISCORD_ALLOWED_USERS='your_user_id'"
fi

if [ -n "$TELEGRAM_BOT_TOKEN" ]; then
    echo "   ✅ TELEGRAM_BOT_TOKEN is set"
    TOKEN_LEN=${#TELEGRAM_BOT_TOKEN}
    echo "      Token length: $TOKEN_LEN characters"
    TELEGRAM_OK=true
else
    echo "   ⚠️  TELEGRAM_BOT_TOKEN not set"
    echo "      Set with: export TELEGRAM_BOT_TOKEN='your_token'"
fi

if [ -n "$TELEGRAM_ALLOWED_USERS" ]; then
    echo "   ✅ TELEGRAM_ALLOWED_USERS is set"
    echo "      Users: $TELEGRAM_ALLOWED_USERS"
else
    echo "   ⚠️  TELEGRAM_ALLOWED_USERS not set"
    echo "      Set with: export TELEGRAM_ALLOWED_USERS='your_user_id'"
fi
echo ""

# Check logs for bot initialization
echo "4. Checking bot initialization in logs..."
if [ -f "server.log" ]; then
    echo "   Log file: server.log"
    echo ""

    if grep -q "\[Discord\]" server.log; then
        echo "   📊 Discord Bot Logs:"
        tail -n 100 server.log | grep "\[Discord\]" | tail -n 5
    else
        echo "   ℹ️  No Discord logs found (bot not configured)"
    fi
    echo ""

    if grep -q "\[Telegram\]" server.log; then
        echo "   📊 Telegram Bot Logs:"
        tail -n 100 server.log | grep "\[Telegram\]" | tail -n 5
    else
        echo "   ℹ️  No Telegram logs found (bot not configured)"
    fi
    echo ""

    if grep -q "\[BotService\]" server.log; then
        echo "   📊 Bot Service Logs:"
        tail -n 100 server.log | grep "\[BotService\]" | tail -n 3
    else
        echo "   ⚠️  No BotService logs found"
    fi
else
    echo "   ⚠️  No server.log file found"
    echo "      Check if VibeManager is logging to console"
fi
echo ""

# Summary
echo "=============================="
echo "📋 Summary"
echo "=============================="
echo ""

if [ "$DISCORD_OK" = true ]; then
    echo "✅ Discord bot is CONFIGURED"
    echo "   Next: Open Discord and send /help to your bot"
    echo ""
else
    echo "⚠️  Discord bot NOT configured"
    echo "   Follow: docs/QUICKSTART_BOTS.md (Option 1)"
    echo ""
fi

if [ "$TELEGRAM_OK" = true ]; then
    echo "✅ Telegram bot is CONFIGURED"
    echo "   Next: Open Telegram and send /start to your bot"
    echo ""
else
    echo "⚠️  Telegram bot NOT configured"
    echo "   Follow: docs/QUICKSTART_BOTS.md (Option 2)"
    echo ""
fi

if [ "$DISCORD_OK" = false ] && [ "$TELEGRAM_OK" = false ]; then
    echo "🚀 Quick Start:"
    echo ""
    echo "1. Get bot tokens from:"
    echo "   Discord: https://discord.com/developers/applications"
    echo "   Telegram: @BotFather on Telegram"
    echo ""
    echo "2. Set environment variables:"
    echo "   export DISCORD_BOT_TOKEN='your_token'"
    echo "   export DISCORD_ALLOWED_USERS='your_user_id'"
    echo ""
    echo "3. Restart VibeManager:"
    echo "   pkill node"
    echo "   node server.js > server.log 2>&1 &"
    echo ""
    echo "📚 Full guide: docs/QUICKSTART_BOTS.md"
else
    echo "✅ At least one bot is configured!"
    echo ""
    echo "To add the other bot:"
    echo "   See docs/QUICKSTART_BOTS.md"
fi
echo ""

echo "=============================="
echo "Test Complete!"
echo "=============================="
