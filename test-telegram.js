// Quick test to verify Telegram bot is connected
process.env.TELEGRAM_BOT_TOKEN = "8553630006:AAEt0mt9t3HAC2g6vmyOn2wjz4vxKJA3EGI";
process.env.TELEGRAM_ALLOWED_USERS = "7574612414";

const { Telegraf } = require('telegraf');

console.log('🧪 Testing Telegram Bot Connection...\n');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

bot.command('test', (ctx) => {
  console.log('✅ Received /test command!');
  ctx.reply('Bot is working! ✅');
});

bot.launch().then(() => {
  console.log('✅ Telegram bot connected successfully!');
  console.log('\n📱 Now open Telegram and:');
  console.log('1. Search for your bot');
  console.log('2. Click Start');
  console.log('3. Send: /test');
  console.log('\nPress Ctrl+C to stop this test.\n');
}).catch(err => {
  console.error('❌ Failed to connect:', err.message);
  process.exit(1);
});

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
