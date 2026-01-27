#!/bin/bash
# Start VibeManager with Telegram Bot
# Usage: ./run-with-telegram.sh

cd /home/clara/VibeManager

# Set environment variables
export TELEGRAM_BOT_TOKEN="8553630006:AAEt0mt9t3HAC2g6vmyOn2wjz4vxKJA3EGI"
export TELEGRAM_ALLOWED_USERS="7574612414"
export PORT=3131
export CODE_PORT=8083

echo "🚀 Starting VibeManager with Telegram Bot"
echo "=========================================="
echo ""
echo "✅ Telegram Token: Set"
echo "✅ Allowed User: 7574612414"
echo ""

# Stop any existing server
pkill -f "node server.js" 2>/dev/null
sleep 2

# Start server
echo "Starting Node server..."
node server.js
