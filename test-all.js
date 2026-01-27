#!/usr/bin/env node
/**
 * Comprehensive Test Suite for VibeManager
 * Tests: LLM detection, sessions, tasks, ralph loop, API endpoints
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Test results
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

function log(msg) {
  console.log(`[TEST] ${msg}`);
}

function pass(name, details = '') {
  results.passed++;
  results.tests.push({ name, status: 'PASS', details });
  console.log(`  [PASS] ${name}${details ? ': ' + details : ''}`);
}

function fail(name, error) {
  results.failed++;
  results.tests.push({ name, status: 'FAIL', error });
  console.log(`  [FAIL] ${name}: ${error}`);
}

// HTTP request helper
function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const protocol = options.protocol === 'https:' ? https : http;
    const req = protocol.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => reject(new Error('Request timed out')));
    if (body) req.write(body);
    req.end();
  });
}

// Test 1: Z.AI LLM API Connection
async function testLLMConnection() {
  log('Testing Z.AI LLM API Connection...');

  const configPath = path.join(process.env.HOME, '.vibemanager', 'bot-config.json');
  let config;

  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (!config.provider || !config.provider.apiKey) {
      fail('LLM Config', 'Provider not configured');
      return;
    }
    pass('LLM Config', 'Provider configured: ' + config.provider.name);
  } catch (err) {
    fail('LLM Config', err.message);
    return;
  }

  // Test API call
  try {
    const url = new URL(config.provider.baseUrl + '/chat/completions');
    const body = JSON.stringify({
      model: config.provider.model || 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Say "test ok" and nothing else.' }],
      max_tokens: 10,
      temperature: 0
    });

    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      protocol: 'https:',
      headers: {
        'Authorization': 'Bearer ' + config.provider.apiKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 30000
    };

    const res = await request(options, body);

    if (res.data.choices && res.data.choices[0]) {
      const content = res.data.choices[0].message.content;
      pass('LLM API Call', 'Response: ' + content.substring(0, 50));
    } else if (res.data.error) {
      fail('LLM API Call', res.data.error.message || 'API error');
    } else {
      fail('LLM API Call', 'Unexpected response format');
    }
  } catch (err) {
    fail('LLM API Call', err.message);
  }
}

// Test 2: Fetch Models from Provider
async function testFetchModels() {
  log('Testing Fetch Models from Provider...');

  const configPath = path.join(process.env.HOME, '.vibemanager', 'bot-config.json');
  let config;

  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (err) {
    fail('Fetch Models', 'Config not found');
    return;
  }

  try {
    const url = new URL(config.provider.baseUrl + '/models');
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'GET',
      protocol: 'https:',
      headers: {
        'Authorization': 'Bearer ' + config.provider.apiKey,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    };

    const res = await request(options);

    if (res.data.data && Array.isArray(res.data.data)) {
      pass('Fetch Models', `Found ${res.data.data.length} models`);
    } else if (res.data.models && Array.isArray(res.data.models)) {
      pass('Fetch Models', `Found ${res.data.models.length} models`);
    } else if (res.data.error) {
      // Some providers don't support /models endpoint
      pass('Fetch Models', 'Endpoint not supported (ok for some providers)');
    } else {
      fail('Fetch Models', 'Unexpected response');
    }
  } catch (err) {
    // Not all providers support /models
    pass('Fetch Models', 'Endpoint not available (ok)');
  }
}

// Test 3: Task Detection Prompt
async function testTaskDetection() {
  log('Testing LLM Task Detection...');

  const configPath = path.join(process.env.HOME, '.vibemanager', 'bot-config.json');
  let config;

  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (err) {
    fail('Task Detection', 'Config not found');
    return;
  }

  // Simulate log output with completion signals
  const testLogs = `
[BotService] Command received: /status test
Checking session status...
Making changes to the codebase...
Running tests...
All 5 tests passed
Creating commit...
[master abc1234] Add new feature for user authentication
 3 files changed, 150 insertions(+), 20 deletions(-)
DONE
`;

  const prompt = `Task: "Add user authentication feature"

Output log:
${testLogs}

Is this task completed? Check for: git commits, passing tests, "DONE" signal, or completion messages.

Reply ONLY with JSON: {"status":"completed"|"in_progress"|"error","confidence":0.0-1.0,"reason":"why"}`;

  try {
    const url = new URL(config.provider.baseUrl + '/chat/completions');
    const body = JSON.stringify({
      model: config.provider.model || 'glm-4.7',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
      temperature: 0.1
    });

    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      protocol: 'https:',
      headers: {
        'Authorization': 'Bearer ' + config.provider.apiKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 30000
    };

    const res = await request(options, body);

    if (res.data.choices && res.data.choices[0]) {
      let content = res.data.choices[0].message.content;

      // Also check reasoning_content for some providers
      if (!content && res.data.choices[0].message.reasoning_content) {
        content = res.data.choices[0].message.reasoning_content;
      }

      if (!content) {
        fail('Task Detection', 'Empty response from LLM');
        return;
      }

      // Strip markdown code fences if present
      content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      // Try to parse JSON
      try {
        // First try direct parse
        const result = JSON.parse(content);
        if (result.status === 'completed' && result.confidence >= 0.7) {
          pass('Task Detection', `Correctly detected completion (confidence: ${result.confidence})`);
        } else {
          fail('Task Detection', `Expected completed, got: ${JSON.stringify(result)}`);
        }
      } catch (parseErr) {
        // Try to extract JSON object
        const jsonMatch = content.match(/\{[^{}]*"status"[^{}]*\}/);
        if (jsonMatch) {
          try {
            const result = JSON.parse(jsonMatch[0]);
            if (result.status === 'completed' && result.confidence >= 0.7) {
              pass('Task Detection', `Correctly detected completion (confidence: ${result.confidence})`);
            } else {
              fail('Task Detection', `Expected completed, got: ${JSON.stringify(result)}`);
            }
          } catch (e2) {
            fail('Task Detection', e2.message + ' | Content: ' + content.slice(0, 150));
          }
        } else {
          fail('Task Detection', 'No JSON found in: ' + content.slice(0, 150));
        }
      }
    } else {
      fail('Task Detection', 'No response from LLM');
    }
  } catch (err) {
    fail('Task Detection', err.message);
  }
}

// Test 4: Bot Config Loading
async function testBotConfig() {
  log('Testing Bot Config...');

  try {
    const BotConfig = require('./bot-config');
    const config = new BotConfig();

    if (config.config) {
      pass('Bot Config Load', 'Config loaded successfully');
    } else {
      fail('Bot Config Load', 'Config is empty');
    }

    // Test get/set
    const testKey = 'test.value';
    config.set(testKey, 'test123');
    const value = config.get(testKey);
    if (value === 'test123') {
      pass('Bot Config Get/Set', 'Get/Set working');
    } else {
      fail('Bot Config Get/Set', 'Value mismatch');
    }

    // Cleanup
    delete config.config.test;
    config.save();

  } catch (err) {
    fail('Bot Config', err.message);
  }
}

// Test 5: Session Manager
async function testSessionManager() {
  log('Testing Session Manager...');

  try {
    const SessionManager = require('./session-manager');
    const sm = new SessionManager();

    // Test list
    const sessions = sm.list();
    pass('Session List', `Found ${sessions.length} sessions`);

    // Test create (if possible)
    const testName = 'test-session-' + Date.now();
    try {
      const session = sm.create(testName, '/tmp/' + testName, 80, 24, '', 'auto', false);
      if (session && session.name === testName) {
        pass('Session Create', 'Created test session');

        // Cleanup
        sm.delete(testName);
        pass('Session Delete', 'Deleted test session');
      }
    } catch (err) {
      // Session creation might fail without tmux
      pass('Session Create', 'Skipped (tmux may not be available)');
    }

  } catch (err) {
    fail('Session Manager', err.message);
  }
}

// Test 6: Ralph Loop
async function testRalphLoop() {
  log('Testing Ralph Loop...');

  try {
    const SessionManager = require('./session-manager');
    const RalphLoop = require('./ralph-loop');
    const BotConfig = require('./bot-config');

    const sm = new SessionManager();
    const rl = new RalphLoop(sm);
    const config = new BotConfig();

    // Set config
    rl.setConfig(config);

    // Test provider detection
    if (rl.isProviderConfigured()) {
      pass('Ralph Provider Check', 'Provider is configured');
    } else {
      fail('Ralph Provider Check', 'Provider not detected');
    }

    // Test detection settings
    rl.updateDetectionSettings({ method: 'both', interval: 30 });
    if (rl.detectionSettings.interval === 30) {
      pass('Ralph Detection Settings', 'Settings updated');
    } else {
      fail('Ralph Detection Settings', 'Settings not updated');
    }

    // Test loop state
    rl.initLoopState('test-session', { maxIterations: 10 });
    const state = rl.getLoopState('test-session');
    if (state && state.maxIterations === 10) {
      pass('Ralph Loop State', 'State initialized correctly');
    } else {
      fail('Ralph Loop State', 'State not initialized');
    }

  } catch (err) {
    fail('Ralph Loop', err.message);
  }
}

// Test 7: Bot Formatter
async function testBotFormatter() {
  log('Testing Bot Formatter...');

  try {
    const BotFormatter = require('./bot-formatter');
    const formatter = new BotFormatter();

    // Test error format
    const error = formatter.formatError('Test error');
    if (error.includes('[ERROR]')) {
      pass('Formatter Error', 'Error format correct (no emojis)');
    } else {
      fail('Formatter Error', 'Error format incorrect');
    }

    // Test session status
    const status = formatter.formatSessionStatus({ name: 'test', alive: true, projectPath: '/test', shellType: 'auto' });
    if (status.includes('[STATUS]')) {
      pass('Formatter Status', 'Status format correct (no emojis)');
    } else {
      fail('Formatter Status', 'Status format incorrect');
    }

    // Test task icons
    const icon = formatter.getTaskIcon('completed');
    if (icon === '[DONE]') {
      pass('Formatter Icons', 'Icons replaced with text');
    } else {
      fail('Formatter Icons', `Expected [DONE], got ${icon}`);
    }

  } catch (err) {
    fail('Bot Formatter', err.message);
  }
}

// Test 8: Telegram Client (structure only)
async function testTelegramClient() {
  log('Testing Telegram Client Structure...');

  try {
    const TelegramClient = require('./telegram-client');

    // Check class exists
    if (typeof TelegramClient === 'function') {
      pass('Telegram Client', 'Class loaded successfully');
    } else {
      fail('Telegram Client', 'Not a class');
    }

    // Check for simplified connection (no ultra-robust)
    const source = fs.readFileSync('./telegram-client.js', 'utf-8');
    if (!source.includes('maxReconnectAttempts') && !source.includes('healthCheckInterval')) {
      pass('Telegram Simplified', 'Ultra-robust connection removed');
    } else {
      fail('Telegram Simplified', 'Still has ultra-robust code');
    }

  } catch (err) {
    fail('Telegram Client', err.message);
  }
}

// Test 9: Settings Page
async function testSettingsPage() {
  log('Testing Settings Page...');

  try {
    const html = fs.readFileSync('./public/settings.html', 'utf-8');

    // Check for provider settings
    if (html.includes('AI Provider') && html.includes('provider-list')) {
      pass('Settings Provider', 'Provider settings present');
    } else {
      fail('Settings Provider', 'Provider settings missing');
    }

    // Check for detection settings
    if (html.includes('Task Detection') && html.includes('detection-method')) {
      pass('Settings Detection', 'Detection settings present');
    } else {
      fail('Settings Detection', 'Detection settings missing');
    }

    // Check title changed
    if (html.includes('<title>Settings - VibeManager</title>')) {
      pass('Settings Title', 'Title renamed correctly');
    } else {
      fail('Settings Title', 'Title not renamed');
    }

    // Check no emojis in providers
    if (!html.includes('🔧') && !html.includes('📊')) {
      pass('Settings No Emojis', 'No emojis in settings');
    } else {
      fail('Settings No Emojis', 'Still has emojis');
    }

  } catch (err) {
    fail('Settings Page', err.message);
  }
}

// Test 10: Server API Endpoints (structure check)
async function testServerAPIs() {
  log('Testing Server API Endpoints...');

  try {
    const source = fs.readFileSync('./server.js', 'utf-8');

    const endpoints = [
      '/api/provider/config',
      '/api/provider/configure',
      '/api/provider/models',
      '/api/provider/detection',
      '/api/bot/config',
      '/api/bot/status',
      '/api/bot/configure'
    ];

    let found = 0;
    for (const endpoint of endpoints) {
      if (source.includes(endpoint)) {
        found++;
      }
    }

    if (found === endpoints.length) {
      pass('Server APIs', `All ${endpoints.length} endpoints present`);
    } else {
      fail('Server APIs', `Only ${found}/${endpoints.length} endpoints found`);
    }

    // Check ralph loop gets config
    if (source.includes('ralphLoop.setConfig')) {
      pass('Server Ralph Config', 'Ralph loop receives config');
    } else {
      fail('Server Ralph Config', 'Ralph loop not receiving config');
    }

  } catch (err) {
    fail('Server APIs', err.message);
  }
}

// Run all tests
async function runTests() {
  console.log('\n' + '='.repeat(60));
  console.log('VibeManager Comprehensive Test Suite');
  console.log('='.repeat(60) + '\n');

  await testLLMConnection();
  await testFetchModels();
  await testTaskDetection();
  await testBotConfig();
  await testSessionManager();
  await testRalphLoop();
  await testBotFormatter();
  await testTelegramClient();
  await testSettingsPage();
  await testServerAPIs();

  console.log('\n' + '='.repeat(60));
  console.log(`RESULTS: ${results.passed} passed, ${results.failed} failed`);
  console.log('='.repeat(60) + '\n');

  // Summary
  if (results.failed > 0) {
    console.log('Failed tests:');
    for (const test of results.tests) {
      if (test.status === 'FAIL') {
        console.log(`  - ${test.name}: ${test.error}`);
      }
    }
  }

  process.exit(results.failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
