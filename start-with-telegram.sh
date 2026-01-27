#!/bin/bash
# Start VibeManager with Telegram Bot

echo "🚀 Starting VibeManager with Telegram Bot"
echo ""

# Load bot configuration
if [ -f ~/.vibemanager/bot.env ]; then
    echo "📋 Loading bot configuration..."
    export $(grep -v '^#' ~/.vibemanager/bot.env | grep -v '^$' | xargs)
    
    # Check if user ID is set
    if [ "$TELEGRAM_ALLOWED_USERS" = "YOUR_USER_ID" ]; then
        echo ""
        echo "⚠️  WARNING: You need to set your Telegram User ID!"
        echo ""
        echo "1. Open Telegram"
        echo "2. Search for: @userinfobot"
        echo "3. Click Start - it will show: Id: 123456789"
        echo "4. Edit ~/.vibemanager/bot.env"
        echo "5. Replace YOUR_USER_ID with your actual ID"
        echo ""
        read -p "Press Enter to continue anyway, or Ctrl+C to stop and fix it first..."
    fi
else
    echo "⚠️  No bot configuration found"
    echo "Using default settings..."
fi

# Stop existing server
pkill -f "node.*server.js" 2>/dev/null
sleep 2

# Start server
cd /home/clara/VibeManager
echo "Starting server..."
node server.js > server.log 2>&1 &

# Wait for startup
sleep 5

# Check status
if pgrep -f "node.*server.js" > /dev/null; then
    echo ""
    echo "✅ VibeManager started!"
    echo ""
    
    # Show Telegram bot status
    if tail -n 50 server.log | grep -q "\[Telegram\] Connected"; then
        echo "✅ Telegram bot connected!"
        echo ""
        echo "Open Telegram and:"
        echo "1. Search for your bot"
        echo "2. Click Start"
        echo "3. Send: /help"
    elif tail -n 50 server.log | grep -q "TELEGRAM"; then
        echo "⚠️  Telegram bot status:"
        tail -n 50 server.log | grep "Telegram" | tail -n 3
    else
        echo "ℹ️  No Telegram logs yet (may still be connecting...)"
    fi
    
    echo ""
    echo "📊 Dashboard: http://localhost:3131"
    echo "📋 Logs: tail -f server.log"
else
    echo "❌ Failed to start"
    echo "Check logs: tail server.log"
fi
