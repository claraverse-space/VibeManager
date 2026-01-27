// bot-config.js - Bot configuration and settings
const fs = require('fs');
const path = require('path');

class BotConfig {
  constructor() {
    this.configPath = path.join(process.env.HOME || '/root', '.vibemanager', 'bot-config.json');
    this.config = this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.configPath)) {
        return JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
      }
    } catch (err) {
      console.error('[BotConfig] Failed to load config:', err.message);
    }

    // Default config
    return {
      discord: {
        enabled: !!process.env.DISCORD_BOT_TOKEN,
        token: process.env.DISCORD_BOT_TOKEN || '',
        allowedUsers: this.parseUserList(process.env.DISCORD_ALLOWED_USERS || ''),
        commandPrefix: '/'
      },
      telegram: {
        enabled: !!process.env.TELEGRAM_BOT_TOKEN,
        token: process.env.TELEGRAM_BOT_TOKEN || '',
        allowedUsers: this.parseUserList(process.env.TELEGRAM_ALLOWED_USERS || ''),
        commandPrefix: '/'
      },
      notifications: {
        taskComplete: true,
        taskStuck: true,
        sessionErrors: true,
        ralphComplete: true
      },
      rateLimit: {
        maxCommandsPerMinute: 10,
        maxCommandsPerHour: 100
      }
    };
  }

  parseUserList(str) {
    if (!str) return [];
    return str.split(',').map(id => id.trim()).filter(Boolean);
  }

  save() {
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (err) {
      console.error('[BotConfig] Failed to save config:', err.message);
    }
  }

  get(key) {
    const keys = key.split('.');
    let value = this.config;
    for (const k of keys) {
      if (value === undefined) return undefined;
      value = value[k];
    }
    return value;
  }

  set(key, value) {
    const keys = key.split('.');
    let obj = this.config;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!obj[keys[i]]) obj[keys[i]] = {};
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
    this.save();
  }

  isDiscordEnabled() {
    return !!(this.config.discord.enabled && this.config.discord.token);
  }

  isTelegramEnabled() {
    return !!(this.config.telegram.enabled && this.config.telegram.token);
  }

  isUserAllowed(platform, userId) {
    const allowedUsers = this.config[platform]?.allowedUsers || [];
    if (allowedUsers.length === 0) return true; // No whitelist = allow all
    return allowedUsers.includes(userId.toString());
  }
}

module.exports = BotConfig;
