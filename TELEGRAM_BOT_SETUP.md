# Telegram Bot Setup - PRODUCTION READY ✅

## Configuration

Your VibeManager Telegram bot is now fully configured and operational!

### Bot Details
- **Bot Username**: @my_vibemanager_bot
- **Bot Name**: Clara
- **Bot ID**: 8553630006
- **Authorized User ID**: 7574612414
- **Status**: ✅ Connected and Polling

### Files Configured

1. **Environment Variables** (`.env`):
   ```env
   TELEGRAM_BOT_TOKEN=8553630006:AAEt0mt9t3HAC2g6vmyOn2wjz4vxKJA3EGI
   TELEGRAM_ALLOWED_USERS=7574612414
   BOT_ENABLED=true
   BOT_COMMAND_PREFIX=/
   ```

2. **Bot Configuration** (`~/.vibemanager/bot-config.json`):
   - Telegram enabled with full notifications
   - Rate limiting configured (10 commands/min, 100/hour)
   - All notification types enabled

### Available Commands

Send these commands to @my_vibemanager_bot in Telegram:

#### Session Management
- `/start` - Welcome message and overview
- `/help` - Show all available commands
- `/list` - List all sessions
- `/create <name> [path]` - Create a new session
- `/status [name]` - Show session status
- `/stop <name>` - Stop a session
- `/delete <name>` - Delete a session

#### Task Management
- `/task <session> <description>` - Add a task
- `/tasks <session>` - List all tasks
- `/progress <session>` - Show current progress

#### Ralph (Autonomous Agent)
- `/ralph start <session>` - Start autonomous loop
- `/ralph pause <session>` - Pause the loop
- `/ralph resume <session>` - Resume the loop
- `/ralph stop <session>` - Stop the loop
- `/ralph verify <session>` - Verify task completion

### Notifications

The bot will automatically notify you when:
- ✅ Tasks complete
- 🔄 Ralph loop finishes
- ⚠️ Tasks get stuck
- ❌ Session errors occur

### Starting the Server

#### Manual Start
```bash
cd /home/clara/VibeManager
./start.sh
```

#### Background Start
```bash
cd /home/clara/VibeManager
nohup ./start.sh > /tmp/vibemanager.log 2>&1 &
```

#### Systemd Service (Recommended for Production)
```bash
# Install the service
sudo cp /tmp/vibemanager.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable vibemanager
sudo systemctl start vibemanager

# Check status
sudo systemctl status vibemanager

# View logs
sudo journalctl -u vibemanager -f
```

### Troubleshooting

#### Bot Not Responding
1. Check if server is running: `ps aux | grep "node server.js"`
2. Check logs: `tail -f /tmp/vibemanager.log`
3. Verify bot status: `curl http://localhost:3131/api/bot/status`
4. Restart server: `pkill -f "node server.js" && ./start.sh`

#### Bot Connection Issues
1. Verify network connectivity: `ping api.telegram.org`
2. Test bot token: `curl https://api.telegram.org/bot<TOKEN>/getMe`
3. Check IPv4 DNS: `echo $NODE_OPTIONS` (should show --dns-result-order=ipv4first)

#### Not Receiving Notifications
1. Verify your user ID is correct: 7574612414
2. Check if you've sent `/start` to the bot
3. Verify notifications are enabled in config: `cat ~/.vibemanager/bot-config.json`

### Security Notes

- ✅ Bot token is stored in `.env` (add to `.gitignore` if not already)
- ✅ Only authorized user ID can interact with bot
- ✅ Configuration backed up in `~/.vibemanager/bot-config.json`
- ✅ Rate limiting enabled to prevent abuse

### Testing

Test the bot by sending `/start` to @my_vibemanager_bot on Telegram!

---
Last Updated: 2026-01-27
