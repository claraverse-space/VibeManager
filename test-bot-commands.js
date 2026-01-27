#!/usr/bin/env node

// Diagnostic tool to test Telegram bot command parsing
const BotParser = require('./bot-parser.js');
const BotService = require('./bot-service.js');
const SessionManager = require('./session-manager.js');
const RalphLoop = require('./ralph-loop.js');
const fs = require('fs');
const path = require('path');

console.log('=================================');
console.log('TELEGRAM BOT COMMAND DIAGNOSTICS');
console.log('=================================\n');

const parser = new BotParser();

// Test 1: Check parser initialization
console.log('✓ Bot parser initialized\n');

// Test 2: List all registered commands
console.log('📋 Registered Commands:');
console.log('------------------------');
const commands = Object.keys(parser.commands);
console.log(`Total commands: ${commands.length}`);
for (const cmd of commands) {
  const def = parser.commands[cmd];
  if (def.subcommands) {
    console.log(`  /${cmd} (${Object.keys(def.subcommands).length} subcommands)`);
    for (const sub of Object.keys(def.subcommands)) {
      console.log(`    ├─ /${cmd} ${sub}`);
    }
  } else {
    const params = (def.params || []).map(p => `<${p}>`).join(' ');
    console.log(`  /${cmd} ${params}`);
  }
}

// Test 3: Test command parsing
console.log('\n\n🧪 Command Parsing Tests:');
console.log('-------------------------');

const testCommands = [
  { cmd: '/start', expect: 'pass' },
  { cmd: '/help', expect: 'pass' },
  { cmd: '/list', expect: 'pass' },
  { cmd: '/status', expect: 'pass' },
  { cmd: '/gpu', expect: 'pass' },
  { cmd: '/logs test-session', expect: 'pass' },
  { cmd: '/logs test-session 100', expect: 'pass' },
  { cmd: '/task test-session do something', expect: 'pass' },
  { cmd: '/tasks test-session', expect: 'pass' },
  { cmd: '/ralph start test-session', expect: 'pass' },
  { cmd: '/ralph pause test-session', expect: 'pass' },
  { cmd: '/unknown', expect: 'fail' },
];

let passed = 0;
let failed = 0;

for (const test of testCommands) {
  const parsed = parser.parse(test.cmd);
  const isPass = parsed && !parsed.error;
  const expected = test.expect === 'pass';
  const result = isPass === expected ? '✅' : '❌';

  if (isPass === expected) {
    passed++;
  } else {
    failed++;
  }

  console.log(`${result} ${test.cmd}`);
  if (parsed && parsed.error) {
    console.log(`   Error: ${parsed.error}`);
  }
  if (parsed && !parsed.error && test.expect === 'pass') {
    console.log(`   Parsed: command="${parsed.command}"${parsed.subcommand ? `, subcommand="${parsed.subcommand}"` : ''}`);
  }
}

console.log(`\nResults: ${passed}/${testCommands.length} tests passed`);

// Test 4: Check bot service integration
console.log('\n\n🔧 Bot Service Integration:');
console.log('---------------------------');

try {
  const sessionManager = new SessionManager();
  const ralphLoop = new RalphLoop(sessionManager);
  const botService = new BotService(sessionManager, ralphLoop, null);

  console.log('✓ BotService created');
  console.log('✓ Parser accessible:', !!botService.parser);
  console.log('✓ Formatter accessible:', !!botService.formatter);

  // Test command handling
  const testCmd = parser.parse('/help');
  if (testCmd && !testCmd.error) {
    console.log('✓ Test command parsed successfully');
  }
} catch (err) {
  console.log('❌ Error:', err.message);
  failed++;
}

// Test 5: Check configuration
console.log('\n\n⚙️  Bot Configuration:');
console.log('----------------------');

const configPath = path.join(process.env.HOME || '/root', '.vibemanager', 'bot-config.json');

try {
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    console.log('✓ Config file found:', configPath);
    console.log('  Telegram enabled:', config.telegram?.enabled || false);
    console.log('  Telegram token:', config.telegram?.token ? '[CONFIGURED]' : '[NOT SET]');
    console.log('  Allowed users:', (config.telegram?.allowedUsers || []).length, 'user(s)');
    console.log('  Command prefix:', config.telegram?.commandPrefix || '/');
  } else {
    console.log('⚠️  Config file not found');
    console.log('   Expected at:', configPath);
  }
} catch (err) {
  console.log('❌ Error reading config:', err.message);
}

// Test 6: Check server status
console.log('\n\n🖥️  Server Status:');
console.log('------------------');

try {
  // Check if server.log exists and has recent activity
  const logPath = path.join(__dirname, 'server.log');
  if (fs.existsSync(logPath)) {
    const stats = fs.statSync(logPath);
    const age = Date.now() - stats.mtimeMs;
    if (age < 60000) { // Modified in last minute
      console.log('✓ Server appears to be running (recent log activity)');
    } else {
      console.log('⚠️  Server may not be running (old logs)');
    }
  } else {
    console.log('⚠️  No server log found - server may not be running');
  }
} catch (err) {
  console.log('⚠️  Cannot determine server status');
}

// Summary
console.log('\n\n' + '='.repeat(50));
console.log('SUMMARY');
console.log('='.repeat(50));

if (failed === 0) {
  console.log('\n✅ All tests passed! Bot commands should work correctly.');
  console.log('\nIf you\'re still seeing "unknown command" errors:');
  console.log('1. Make sure the server is running: node server.js');
  console.log('2. Restart the server to reload code');
  console.log('3. Try sending /start to the bot to verify connection');
  console.log('4. Check server logs: tail -f server.log');
  console.log('5. Try the /help command to see all available commands');
} else {
  console.log('\n❌ Some tests failed. Please check the errors above.');
}

console.log('\nFor more help, see: TELEGRAM_BOT_GUIDE.md\n');
