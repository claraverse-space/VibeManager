require('dotenv').config();

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const pty = require('node-pty');
const path = require('path');
const fs = require('fs');
const net = require('net');
const { spawn, execSync } = require('child_process');
const SessionManager = require('./session-manager');
const RalphLoop = require('./ralph-loop');
const ConversationLinker = require('./conversation-linker');
const SummaryGenerator = require('./summary-generator');
const BotService = require('./bot-service');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3131;
const CODE_PORT = process.env.CODE_PORT || 8083;
const TMUX_BIN = '/usr/bin/tmux';

// Start code-server for local installations (not in Docker)
let codeServerProcess = null;

// Common paths where code-server might be installed
const CODE_SERVER_SEARCH_PATHS = [
  '/usr/bin/code-server',
  '/usr/local/bin/code-server',
  path.join(process.env.HOME || '', '.local/bin/code-server'),
  path.join(process.env.HOME || '', '.local/lib/code-server/bin/code-server'),
  '/opt/homebrew/bin/code-server'
];

function findCodeServer() {
  // First try which
  try {
    const result = execSync('which code-server 2>/dev/null', { encoding: 'utf-8' }).trim();
    if (result && fs.existsSync(result)) return result;
  } catch {}

  // Search common paths
  for (const p of CODE_SERVER_SEARCH_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function startCodeServer() {
  // Skip if running in Docker (code-server started separately)
  if (process.env.DOCKER === '1' || fs.existsSync('/.dockerenv')) {
    console.log('Running in Docker, code-server managed externally');
    return;
  }

  // Check if code-server is installed
  const codeServerPath = findCodeServer();
  if (!codeServerPath) {
    console.log('code-server not installed, VS Code tab will be unavailable');
    console.log('Install with: curl -fsSL https://code-server.dev/install.sh | sh');
    return;
  }

  // Check if already running on CODE_PORT
  try {
    execSync(`ss -tlnH | grep ":${CODE_PORT}"`, { encoding: 'utf-8' });
    console.log(`code-server already running on port ${CODE_PORT}`);
    return;
  } catch {
    // Not running, start it
  }

  const workspaceDir = process.env.HOME || '/home';
  console.log(`Starting code-server on port ${CODE_PORT}...`);

  // Create env without PORT to prevent code-server from using it
  const codeServerEnv = { ...process.env };
  delete codeServerEnv.PORT;

  codeServerProcess = spawn(codeServerPath, [
    '--bind-addr', `0.0.0.0:${CODE_PORT}`,
    '--auth', 'none',
    '--disable-telemetry',
    workspaceDir
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
    env: codeServerEnv
  });

  codeServerProcess.stdout.on('data', (data) => {
    console.log(`code-server: ${data.toString().trim()}`);
  });

  codeServerProcess.stderr.on('data', (data) => {
    console.log(`code-server: ${data.toString().trim()}`);
  });

  codeServerProcess.on('error', (err) => {
    console.error(`code-server failed to start: ${err.message}`);
  });

  codeServerProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`code-server exited with code ${code}`);
    }
  });

  codeServerProcess.unref();
  console.log(`code-server started on port ${CODE_PORT}`);
}

// Start code-server after a short delay to let main server start first
setTimeout(startCodeServer, 1000);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const sessionManager = new SessionManager();
const ralphLoop = new RalphLoop(sessionManager);
const conversationLinker = new ConversationLinker();
const summaryGenerator = new SummaryGenerator();
const GPUMonitor = require('./gpu-monitor');
const gpuMonitor = new GPUMonitor();
const terminals = new Map(); // termId -> { term, sessionName, ws }
const activeAttachments = new Map(); // sessionName -> Set<ws>

// Initialize bot service (Discord + Telegram)
let botService = new BotService(sessionManager, ralphLoop, gpuMonitor);
botService.initialize().catch(err => {
  console.error('[BotService] Failed to initialize:', err);
});

// Function to restart bot service with new config
async function restartBotService() {
  if (botService) {
    await botService.shutdown();
  }
  botService = new BotService(sessionManager, ralphLoop, gpuMonitor);
  await botService.initialize();
  return botService;
}

// --- Run Migrations on Startup ---
function runMigrations() {
  console.log('[Migrations] Running schema migrations...');

  const sessions = sessionManager.list();
  let migratedCount = 0;

  for (const session of sessions) {
    try {
      const prd = sessionManager.loadPrd(session.name);
      if (!prd || !prd.stories || prd.stories.length === 0) continue;

      // Check if migration needed (check first story for new fields)
      const firstStory = prd.stories[0];
      if (firstStory.status !== undefined) continue; // Already migrated

      // Migrate this session's PRD
      sessionManager.migratePrdToNewSchema(session.name);
      migratedCount++;
    } catch (err) {
      console.error(`[Migrations] Failed to migrate session "${session.name}":`, err.message);
    }
  }

  if (migratedCount > 0) {
    console.log(`[Migrations] Migrated ${migratedCount} session(s) to new schema`);
  } else {
    console.log('[Migrations] No migrations needed');
  }
}

// Run migrations on startup
runMigrations();

// Ralph loop event handlers
ralphLoop.on('started', ({ sessionName, state }) => {
  broadcastLoopEvent('loop_started', sessionName, state);
});

ralphLoop.on('paused', ({ sessionName, state }) => {
  broadcastLoopEvent('loop_paused', sessionName, state);
});

ralphLoop.on('resumed', ({ sessionName, state }) => {
  broadcastLoopEvent('loop_resumed', sessionName, state);
});

ralphLoop.on('stopped', ({ sessionName, state }) => {
  broadcastLoopEvent('loop_stopped', sessionName, state);
});

ralphLoop.on('complete', ({ sessionName, state }) => {
  broadcastLoopEvent('loop_complete', sessionName, state);
});

ralphLoop.on('stuck', ({ sessionName, state, reason }) => {
  broadcastLoopEvent('loop_stuck', sessionName, { ...state, stuckReason: reason });
});

ralphLoop.on('iteration', ({ sessionName, state, taskId, iteration }) => {
  broadcastLoopEvent('loop_iteration', sessionName, { ...state, taskId, iteration });
});

ralphLoop.on('taskComplete', ({ sessionName, state, taskId }) => {
  broadcastLoopEvent('task_complete', sessionName, { ...state, taskId });
});

function broadcastLoopEvent(type, sessionName, data) {
  const payload = JSON.stringify({ type, sessionName, data, timestamp: Date.now() });
  for (const client of statusClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

// --- REST APIs ---

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), sessions: sessionManager.list().length });
});

// System stats for RPi monitoring - background collection (non-blocking)
const { exec } = require('child_process');
let sysCache = null;
let prevCpu = null;
let portsCache = [];

function collectSystemStats() {
  const stats = {};

  // CPU from /proc/stat (fast virtual file read)
  try {
    const statLines = fs.readFileSync('/proc/stat', 'utf-8').split('\n');
    const cpuLine = statLines[0].split(/\s+/).slice(1).map(Number);
    const idle = cpuLine[3] + (cpuLine[4] || 0);
    const total = cpuLine.reduce((a, b) => a + b, 0);
    let cpuPercent = 0;
    if (prevCpu) {
      const dTotal = total - prevCpu.total;
      const dIdle = idle - prevCpu.idle;
      cpuPercent = dTotal > 0 ? Math.round((1 - dIdle / dTotal) * 100) : 0;
    }
    prevCpu = { total, idle };

    let cores = 0;
    for (let i = 1; i < statLines.length; i++) {
      if (!statLines[i].startsWith('cpu')) break;
      cores++;
    }
    stats.cpu = { percent: cpuPercent, cores };
  } catch { stats.cpu = { percent: 0, cores: 0 }; }

  // Memory from /proc/meminfo
  try {
    const memInfo = fs.readFileSync('/proc/meminfo', 'utf-8');
    const memMatch = (key) => {
      const m = memInfo.match(new RegExp(`${key}:\\s+(\\d+)`));
      return m ? parseInt(m[1]) : 0;
    };
    const memTotal = memMatch('MemTotal');
    const memAvail = memMatch('MemAvailable');
    const memUsed = memTotal - memAvail;
    const swapTotal = memMatch('SwapTotal');
    const swapFree = memMatch('SwapFree');
    stats.mem = { total: memTotal, used: memUsed, percent: memTotal > 0 ? Math.round(memUsed / memTotal * 100) : 0 };
    stats.swap = { total: swapTotal, used: swapTotal - swapFree, percent: swapTotal > 0 ? Math.round((swapTotal - swapFree) / swapTotal * 100) : 0 };
  } catch { stats.mem = { total: 0, used: 0, percent: 0 }; stats.swap = { total: 0, used: 0, percent: 0 }; }

  // Temperature
  try {
    stats.temp = Math.round(parseFloat(fs.readFileSync('/sys/class/thermal/thermal_zone0/temp', 'utf-8')) / 100) / 10;
  } catch { stats.temp = 0; }

  // Load average
  try {
    stats.load = fs.readFileSync('/proc/loadavg', 'utf-8').split(/\s+/).slice(0, 3).map(Number);
  } catch { stats.load = [0, 0, 0]; }

  // Network
  try {
    let netRx = 0, netTx = 0;
    const netDev = fs.readFileSync('/proc/net/dev', 'utf-8').split('\n');
    for (const line of netDev) {
      if (line.includes(':') && !line.includes('lo:')) {
        const parts = line.split(':')[1].trim().split(/\s+/).map(Number);
        netRx += parts[0];
        netTx += parts[8];
      }
    }
    stats.net = { rx: netRx, tx: netTx };
  } catch { stats.net = { rx: 0, tx: 0 }; }

  stats.uptime = Math.floor(process.uptime());

  // Disk usage - async (only blocking part)
  exec("df / --output=pcent,used,size -B1 2>/dev/null | tail -1", { encoding: 'utf-8', timeout: 3000 }, (err, stdout) => {
    if (!err && stdout) {
      const parts = stdout.trim().split(/\s+/);
      stats.disk = { percent: parseInt(parts[0]) || 0, used: parseInt(parts[1]) || 0, total: parseInt(parts[2]) || 0 };
    } else {
      stats.disk = sysCache ? sysCache.disk : { percent: 0, used: 0, total: 0 };
    }
    sysCache = stats;
  });
}

// Collect stats every 2s in background, never blocks request handling
collectSystemStats();
setInterval(collectSystemStats, 2000);

// Collect listening ports every 5s
function collectPorts() {
  exec("ss -tlnH 2>/dev/null | awk '{print $4}'", { encoding: 'utf-8', timeout: 3000 }, (err, stdout) => {
    if (!err && stdout) {
      portsCache = [...new Set(
        stdout.trim().split('\n')
          .map(addr => { const parts = addr.split(':'); return parseInt(parts[parts.length - 1]); })
          .filter(p => p && p !== parseInt(PORT) && p > 1024 && p < 65535)
      )].sort((a, b) => a - b);
    }
  });
}
collectPorts();
setInterval(collectPorts, 5000);

app.get('/api/system', (req, res) => {
  if (sysCache) {
    res.json(sysCache);
  } else {
    res.json({ cpu: { percent: 0, cores: 0 }, mem: { total: 0, used: 0, percent: 0 }, swap: { total: 0, used: 0, percent: 0 }, temp: 0, disk: { percent: 0, used: 0, total: 0 }, load: [0, 0, 0], net: { rx: 0, tx: 0 }, uptime: 0 });
  }
});

app.get('/api/browse', (req, res) => {
  const dir = req.query.path || process.env.HOME || '/home';
  try {
    if (!fs.existsSync(dir)) return res.status(404).json({ error: 'Directory not found' });
    const stat = fs.statSync(dir);
    if (!stat.isDirectory()) return res.status(400).json({ error: 'Not a directory' });
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const folders = entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => ({ name: e.name, path: path.join(dir, e.name) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json({ current: dir, parent: path.dirname(dir), folders });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/mkdir', (req, res) => {
  const { parentPath, name } = req.body;
  if (!parentPath || !name) return res.status(400).json({ error: 'parentPath and name required' });
  if (/[\/\\]/.test(name) || name === '.' || name === '..') return res.status(400).json({ error: 'Invalid folder name' });
  const fullPath = path.join(parentPath, name);
  try {
    if (fs.existsSync(fullPath)) return res.status(409).json({ error: 'Already exists' });
    fs.mkdirSync(fullPath, { recursive: true });
    res.json({ success: true, path: fullPath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/ports', (req, res) => {
  exec("ss -tlnH 2>/dev/null | awk '{print $4}'", { encoding: 'utf-8', timeout: 3000 }, (err, stdout) => {
    if (err || !stdout) return res.json({ ports: [] });
    const ports = [...new Set(
      stdout.trim().split('\n')
        .map(addr => {
          const parts = addr.split(':');
          return parseInt(parts[parts.length - 1]);
        })
        .filter(p => p && p !== parseInt(PORT) && p > 1024 && p < 65535)
    )].sort((a, b) => a - b);
    res.json({ ports });
  });
});

// API: Clone git repo
app.post('/api/clone', (req, res) => {
  const { gitUrl, name } = req.body;
  if (!gitUrl) return res.status(400).json({ error: 'gitUrl is required' });

  // Extract repo name from URL if name not provided
  let repoName = name;
  if (!repoName) {
    const match = gitUrl.match(/\/([^\/]+?)(\.git)?$/);
    repoName = match ? match[1] : 'cloned-repo';
  }
  // Sanitize
  repoName = repoName.replace(/[^a-zA-Z0-9_-]/g, '-').substring(0, 50);

  const cloneDir = path.join(process.env.HOME, repoName);

  if (fs.existsSync(cloneDir)) {
    return res.status(409).json({ error: `Directory "${repoName}" already exists`, path: cloneDir, name: repoName });
  }

  // Clone async
  exec(`git clone "${gitUrl}" "${cloneDir}"`, { timeout: 120000 }, (err, stdout, stderr) => {
    if (err) {
      return res.status(500).json({ error: `Clone failed: ${stderr || err.message}` });
    }
    res.json({ success: true, path: cloneDir, name: repoName });
  });
});

// --- Session APIs ---

app.get('/api/sessions', (req, res) => {
  res.json({ sessions: sessionManager.list() });
});

app.get('/api/sessions/last', (req, res) => {
  const last = sessionManager.getLastActive();
  res.json({ lastActiveSession: last, session: last ? sessionManager.get(last) : null });
});

app.post('/api/sessions', (req, res) => {
  const { name, projectPath, initialPrompt, shell, autonomous } = req.body;
  if (!name || !projectPath) return res.status(400).json({ error: 'name and projectPath required' });
  if (!/^[a-zA-Z0-9_-]{1,50}$/.test(name)) return res.status(400).json({ error: 'Name: 1-50 chars, letters/numbers/dashes/underscores only' });
  try {
    const session = sessionManager.create(name, projectPath, 80, 24, initialPrompt || '', shell || 'auto', autonomous !== false);
    res.status(201).json(session);
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

app.get('/api/sessions/:name', (req, res) => {
  const session = sessionManager.get(req.params.name);
  if (!session) return res.status(404).json({ error: 'Not found' });
  res.json(session);
});

app.delete('/api/sessions/:name', (req, res) => {
  try {
    sessionManager.delete(req.params.name);
    res.json({ success: true });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

app.post('/api/sessions/:name/revive', (req, res) => {
  try {
    const session = sessionManager.revive(req.params.name);
    res.json(session);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/sessions/:name/stop', (req, res) => {
  try {
    sessionManager.stop(req.params.name);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/stats', (req, res) => {
  const sessions = sessionManager.list();
  const running = sessions.filter(s => s.alive).length;
  res.json({
    total: sessions.length,
    running,
    stopped: sessions.length - running,
    uptime: Math.floor(process.uptime()),
    sessions
  });
});

// --- Scrollback APIs ---

// Capture scrollback for a session
app.post('/api/sessions/:name/capture', (req, res) => {
  const sessionName = req.params.name;
  const session = sessionManager.get(sessionName);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  if (!session.alive) return res.status(400).json({ error: 'Session not running' });

  const result = sessionManager.captureScrollback(sessionName);
  if (!result) return res.status(500).json({ error: 'Failed to capture scrollback' });

  // Cleanup old scrollback files (keep last 20)
  sessionManager.cleanupScrollback(sessionName, 20);

  res.json(result);
});

// List scrollback history for a session
app.get('/api/sessions/:name/scrollback', (req, res) => {
  const sessionName = req.params.name;
  const session = sessionManager.get(sessionName);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const history = sessionManager.getScrollbackHistory(sessionName);
  res.json({ files: history });
});

// Get specific scrollback content
app.get('/api/sessions/:name/scrollback/:timestamp', (req, res) => {
  const sessionName = req.params.name;
  const timestamp = req.params.timestamp;
  const session = sessionManager.get(sessionName);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const content = sessionManager.getScrollbackContent(sessionName, timestamp);
  if (content === null) return res.status(404).json({ error: 'Scrollback not found' });

  res.json({ content, timestamp });
});

// Delete specific scrollback
app.delete('/api/sessions/:name/scrollback/:timestamp', (req, res) => {
  const sessionName = req.params.name;
  const timestamp = req.params.timestamp;
  const session = sessionManager.get(sessionName);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const deleted = sessionManager.deleteScrollback(sessionName, timestamp);
  if (!deleted) return res.status(404).json({ error: 'Scrollback not found' });

  res.json({ success: true });
});

// --- Task Tracking APIs ---

// Initialize PRD with tasks
app.post('/api/sessions/:name/prd', (req, res) => {
  const sessionName = req.params.name;
  const { name, description, stories } = req.body;

  try {
    const prd = sessionManager.initPrd(sessionName, name, description, stories || []);
    res.status(201).json(prd);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get all tasks for a session
app.get('/api/sessions/:name/tasks', (req, res) => {
  const sessionName = req.params.name;
  const session = sessionManager.get(sessionName);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const tasks = sessionManager.getTasks(sessionName);
  const stats = sessionManager.getTaskStats(sessionName);
  res.json({ tasks, stats });
});

// Add a task
app.post('/api/sessions/:name/tasks', (req, res) => {
  const sessionName = req.params.name;
  const { title, description } = req.body;

  if (!title) return res.status(400).json({ error: 'title is required' });

  try {
    const task = sessionManager.addTask(sessionName, title, description || '');
    res.status(201).json(task);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get a specific task
app.get('/api/sessions/:name/tasks/:taskId', (req, res) => {
  const sessionName = req.params.name;
  const taskId = req.params.taskId;

  const task = sessionManager.getTask(sessionName, taskId);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  res.json(task);
});

// Update a task
app.patch('/api/sessions/:name/tasks/:taskId', (req, res) => {
  const sessionName = req.params.name;
  const taskId = req.params.taskId;
  const updates = req.body;

  try {
    const task = sessionManager.updateTask(sessionName, taskId, updates);
    res.json(task);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete a task
app.delete('/api/sessions/:name/tasks/:taskId', (req, res) => {
  const sessionName = req.params.name;
  const taskId = req.params.taskId;

  try {
    sessionManager.deleteTask(sessionName, taskId);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Mark task as complete
app.post('/api/sessions/:name/tasks/:taskId/complete', (req, res) => {
  const sessionName = req.params.name;
  const taskId = req.params.taskId;

  try {
    const task = sessionManager.markTaskComplete(sessionName, taskId);
    res.json(task);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get task stats
app.get('/api/sessions/:name/tasks/stats', (req, res) => {
  const sessionName = req.params.name;
  const session = sessionManager.get(sessionName);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const stats = sessionManager.getTaskStats(sessionName);
  res.json(stats);
});

// Get live progress for a specific task
app.get('/api/sessions/:name/tasks/:taskId/progress', (req, res) => {
  const sessionName = req.params.name;
  const taskId = req.params.taskId;

  const session = sessionManager.get(sessionName);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const task = sessionManager.getTask(sessionName, taskId);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  // Get live status from status file if available
  const statusData = sessionManager.readStatusFile(sessionName);
  const liveStatus = statusData && statusData.task === taskId ? {
    currentStep: statusData.currentStep,
    liveProgress: statusData.progress,
    lastUpdate: statusData.timestamp,
    source: 'status_file'
  } : null;

  // Calculate progress from steps if not in live status
  const calculatedProgress = sessionManager.calculateTaskProgress(task);

  res.json({
    task,
    status: task.status,
    progress: task.progress,
    calculatedProgress,
    steps: task.steps,
    liveStatus,
    validation: task.validation
  });
});

// Get all tasks with live status
app.get('/api/sessions/:name/tasks/live', (req, res) => {
  const sessionName = req.params.name;
  const session = sessionManager.get(sessionName);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const tasks = sessionManager.getTasks(sessionName);
  const statusData = sessionManager.readStatusFile(sessionName);

  // Enrich tasks with live status
  const tasksWithLiveStatus = tasks.map(task => {
    const liveStatus = statusData && statusData.task === task.id ? {
      currentStep: statusData.currentStep,
      liveProgress: statusData.progress,
      lastUpdate: statusData.timestamp,
      source: 'status_file'
    } : null;

    return {
      ...task,
      calculatedProgress: sessionManager.calculateTaskProgress(task),
      liveStatus
    };
  });

  res.json({ tasks: tasksWithLiveStatus });
});

// --- Progress Tracking APIs ---

// Get progress entries (parsed)
app.get('/api/sessions/:name/progress', (req, res) => {
  const sessionName = req.params.name;
  const session = sessionManager.get(sessionName);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const format = req.query.format || 'parsed';
  if (format === 'raw') {
    const raw = sessionManager.getProgressRaw(sessionName);
    res.type('text/plain').send(raw);
  } else {
    const entries = sessionManager.getProgress(sessionName);
    res.json({ entries });
  }
});

// Append progress entry
app.post('/api/sessions/:name/progress', (req, res) => {
  const sessionName = req.params.name;
  const { content, category } = req.body;

  if (!content) return res.status(400).json({ error: 'content is required' });

  const session = sessionManager.get(sessionName);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const success = sessionManager.appendProgress(sessionName, content, category || 'info');
  if (!success) return res.status(500).json({ error: 'Failed to append progress' });

  res.status(201).json({ success: true });
});

// Clear progress
app.delete('/api/sessions/:name/progress', (req, res) => {
  const sessionName = req.params.name;
  const session = sessionManager.get(sessionName);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const success = sessionManager.clearProgress(sessionName);
  res.json({ success });
});

// --- Exit Detection APIs ---

// Analyze session output for completion/stuck state
app.get('/api/sessions/:name/analyze', (req, res) => {
  const sessionName = req.params.name;
  const session = sessionManager.get(sessionName);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  // Capture fresh scrollback first
  if (session.alive) {
    sessionManager.captureScrollback(sessionName);
  }

  const analysis = sessionManager.analyzeSessionOutput(sessionName);
  if (!analysis) {
    return res.status(400).json({ error: 'No output available to analyze' });
  }

  res.json(analysis);
});

// Detect completion from provided output
app.post('/api/detect/completion', (req, res) => {
  const { output } = req.body;
  if (!output) return res.status(400).json({ error: 'output is required' });

  const result = sessionManager.detectCompletion(output);
  res.json(result);
});

// Detect stuck state from provided output
app.post('/api/detect/stuck', (req, res) => {
  const { output } = req.body;
  if (!output) return res.status(400).json({ error: 'output is required' });

  const result = sessionManager.detectStuckState(output);
  res.json(result);
});

// --- Ralph Loop APIs ---

// Start Ralph loop for a session
app.post('/api/sessions/:name/ralph/start', async (req, res) => {
  const sessionName = req.params.name;
  const { maxIterations, circuitBreakerThreshold } = req.body;

  try {
    // Initialize loop state with config
    ralphLoop.initLoopState(sessionName, {
      maxIterations: maxIterations || 50,
      circuitBreakerThreshold: circuitBreakerThreshold || 3
    });

    const state = await ralphLoop.startLoop(sessionName);
    res.json(state);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Pause Ralph loop
app.post('/api/sessions/:name/ralph/pause', (req, res) => {
  const sessionName = req.params.name;

  try {
    const state = ralphLoop.pauseLoop(sessionName);
    res.json(state);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Resume Ralph loop
app.post('/api/sessions/:name/ralph/resume', async (req, res) => {
  const sessionName = req.params.name;

  try {
    const state = await ralphLoop.resumeLoop(sessionName);
    res.json(state);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Resume Ralph loop with verification (asks Claude if stuck task is complete)
app.post('/api/sessions/:name/ralph/verify', async (req, res) => {
  const sessionName = req.params.name;

  try {
    const state = await ralphLoop.resumeWithVerification(sessionName);
    res.json({
      ...state,
      message: 'Verification prompt sent to Claude. System will check if task is actually complete.'
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Stop Ralph loop
app.post('/api/sessions/:name/ralph/stop', (req, res) => {
  const sessionName = req.params.name;

  try {
    const state = ralphLoop.stopLoop(sessionName);
    res.json(state || { status: 'idle' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get Ralph loop status
app.get('/api/sessions/:name/ralph/status', (req, res) => {
  const sessionName = req.params.name;

  const state = ralphLoop.getLoopState(sessionName);
  if (!state) {
    return res.json({ status: 'idle', sessionName });
  }

  res.json(state);
});

// Process completion check (manually trigger analysis)
app.post('/api/sessions/:name/ralph/check', (req, res) => {
  const sessionName = req.params.name;
  const session = sessionManager.get(sessionName);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  // Capture fresh scrollback and analyze
  if (session.alive) {
    sessionManager.captureScrollback(sessionName);
  }

  const analysis = sessionManager.analyzeSessionOutput(sessionName);
  if (!analysis) {
    return res.status(400).json({ error: 'No output to analyze' });
  }

  // Process the analysis through the loop
  ralphLoop.processTaskCompletion(sessionName, analysis);

  const state = ralphLoop.getLoopState(sessionName);
  res.json({ analysis, loopState: state });
});

// Get all active loops status
app.get('/api/ralph/status', (req, res) => {
  const status = ralphLoop.getAllLoopStatus();
  res.json(status);
});

// --- Checkpoint APIs ---

// Create checkpoint
app.post('/api/sessions/:name/checkpoints', (req, res) => {
  const sessionName = req.params.name;
  const { name, description, trigger } = req.body;

  try {
    const checkpoint = sessionManager.createCheckpoint(sessionName, name, description, trigger || 'manual');
    res.status(201).json(checkpoint);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// List checkpoints
app.get('/api/sessions/:name/checkpoints', (req, res) => {
  const sessionName = req.params.name;
  const session = sessionManager.get(sessionName);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const checkpoints = sessionManager.listCheckpoints(sessionName);
  res.json({ checkpoints });
});

// Get specific checkpoint
app.get('/api/sessions/:name/checkpoints/:id', (req, res) => {
  const sessionName = req.params.name;
  const checkpointId = req.params.id;

  const checkpoint = sessionManager.getCheckpoint(sessionName, checkpointId);
  if (!checkpoint) return res.status(404).json({ error: 'Checkpoint not found' });

  res.json(checkpoint);
});

// Delete checkpoint
app.delete('/api/sessions/:name/checkpoints/:id', (req, res) => {
  const sessionName = req.params.name;
  const checkpointId = req.params.id;

  const deleted = sessionManager.deleteCheckpoint(sessionName, checkpointId);
  if (!deleted) return res.status(404).json({ error: 'Checkpoint not found' });

  res.json({ success: true });
});

// Restore checkpoint
app.post('/api/sessions/:name/checkpoints/:id/restore', (req, res) => {
  const sessionName = req.params.name;
  const checkpointId = req.params.id;
  const { restoreGit, force } = req.body;

  try {
    const result = sessionManager.restoreCheckpoint(sessionName, checkpointId, { restoreGit, force });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Compare checkpoints
app.get('/api/sessions/:name/checkpoints/compare', (req, res) => {
  const sessionName = req.params.name;
  const { from, to } = req.query;

  if (!from || !to) {
    return res.status(400).json({ error: 'from and to checkpoint IDs required' });
  }

  try {
    const comparison = sessionManager.compareCheckpoints(sessionName, from, to);
    res.json(comparison);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- Conversation Linking APIs ---

// Get conversation for a session (links to Claude logs via project path)
app.get('/api/sessions/:name/conversation', (req, res) => {
  const sessionName = req.params.name;
  const session = sessionManager.get(sessionName);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const limit = parseInt(req.query.limit) || 50;
  const sessionId = req.query.sessionId;
  const includeToolCalls = req.query.includeToolCalls !== 'false';

  const result = conversationLinker.getConversationForSession(session.projectPath, {
    limit,
    sessionId,
    includeToolCalls
  });

  if (!result.found) {
    return res.status(404).json({ error: result.error });
  }

  res.json(result);
});

// Get conversation summary for a session
app.get('/api/sessions/:name/conversation/summary', (req, res) => {
  const sessionName = req.params.name;
  const session = sessionManager.get(sessionName);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const summary = conversationLinker.getConversationSummary(session.projectPath);
  if (!summary) {
    return res.status(404).json({ error: 'No conversation found for this project' });
  }

  res.json(summary);
});

// List available Claude sessions for a project
app.get('/api/sessions/:name/conversation/sessions', (req, res) => {
  const sessionName = req.params.name;
  const session = sessionManager.get(sessionName);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const sessions = conversationLinker.getSessions(session.projectPath);
  res.json({ sessions });
});

// --- Cross-Session Memory APIs ---

// Get all memory
app.get('/api/memory', (req, res) => {
  const memory = sessionManager.getMemory();
  res.json(memory);
});

// Get relevant memories for a project type or tags
app.get('/api/memory/relevant', (req, res) => {
  const { projectType, tags, limit } = req.query;
  const tagList = tags ? tags.split(',') : [];
  const limitNum = parseInt(limit) || 10;

  const memories = sessionManager.getRelevantMemories(projectType, tagList, limitNum);
  res.json({ memories });
});

// Add a memory entry manually
app.post('/api/memory', (req, res) => {
  const { type, content, source, tags, projectType } = req.body;

  if (!content) {
    return res.status(400).json({ error: 'content is required' });
  }

  const entry = sessionManager.addMemoryEntry({
    type: type || 'learning',
    content,
    source: source || 'manual',
    tags: tags || [],
    projectType
  });

  res.status(201).json(entry);
});

// Aggregate memories from all sessions
app.post('/api/memory/aggregate', (req, res) => {
  try {
    const result = sessionManager.aggregateMemories();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Clear all memory (for testing/reset)
app.delete('/api/memory', (req, res) => {
  const { confirm } = req.body;

  if (confirm !== 'DELETE_ALL_MEMORY') {
    return res.status(400).json({ error: 'Confirmation required: set confirm to "DELETE_ALL_MEMORY"' });
  }

  const result = sessionManager.clearMemory();
  res.json({ success: true, memory: result });
});

// Get memory patterns and preferences
app.get('/api/memory/patterns', (req, res) => {
  const memory = sessionManager.getMemory();
  res.json({
    patterns: memory.patterns || [],
    techPreferences: memory.techPreferences || {},
    commonErrors: memory.commonErrors || [],
    lastUpdated: memory.lastUpdated
  });
});

// Extract memories from a specific session
app.post('/api/sessions/:name/memory/extract', (req, res) => {
  const sessionName = req.params.name;
  const session = sessionManager.get(sessionName);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const extracted = sessionManager.extractMemoryFromProgress(sessionName);

  // Optionally add to global memory
  const { addToGlobal } = req.body;
  let added = 0;

  if (addToGlobal) {
    const memory = sessionManager.loadMemory();
    for (const entry of extracted) {
      // Check for duplicates
      const isDuplicate = memory.entries.some(e =>
        e.source === entry.source &&
        e.content.substring(0, 100) === entry.content.substring(0, 100)
      );

      if (!isDuplicate) {
        sessionManager.addMemoryEntry(entry);
        added++;
      }
    }
  }

  res.json({
    extracted,
    count: extracted.length,
    addedToGlobal: added
  });
});

// --- Settings APIs ---

// Get all settings
app.get('/api/settings', (req, res) => {
  const settings = summaryGenerator.getSettings();
  // Don't expose full API key
  const safeSettings = { ...settings };
  if (safeSettings.ai?.apiKey) {
    safeSettings.ai = {
      ...safeSettings.ai,
      apiKey: safeSettings.ai.apiKey.substring(0, 8) + '...'
    };
  }
  res.json(safeSettings);
});

// Update settings
app.patch('/api/settings', (req, res) => {
  const updates = req.body;
  const settings = summaryGenerator.updateSettings(updates);
  // Don't expose full API key
  const safeSettings = { ...settings };
  if (safeSettings.ai?.apiKey) {
    safeSettings.ai = {
      ...safeSettings.ai,
      apiKey: safeSettings.ai.apiKey.substring(0, 8) + '...'
    };
  }
  res.json(safeSettings);
});

// Test API connection
app.post('/api/settings/test', async (req, res) => {
  const result = await summaryGenerator.testConnection();
  res.json(result);
});

// --- GPU Monitoring APIs ---

// Get all GPU stats
app.get('/api/gpu/stats', (req, res) => {
  try {
    const stats = gpuMonitor.getAllGPUStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get GPU summary
app.get('/api/gpu/summary', (req, res) => {
  try {
    const summary = gpuMonitor.getSummary();
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get available GPU monitors
app.get('/api/gpu/monitors', (req, res) => {
  res.json({
    platform: gpuMonitor.platform,
    availableMonitors: gpuMonitor.availableMonitors
  });
});

// --- Bot Configuration APIs ---

// Get current bot configuration (Telegram only)
app.get('/api/bot/config', (req, res) => {
  const config = botService.config.config;
  res.json({
    telegram: {
      token: config.telegram.token ? '***' + config.telegram.token.slice(-10) : '',
      allowedUsers: config.telegram.allowedUsers
    }
  });
});

// Get bot connection status (Telegram only)
app.get('/api/bot/status', (req, res) => {
  const status = botService.getStatus();
  res.json({
    telegram: status.telegram
  });
});

// Configure and test Telegram bot
app.post('/api/bot/configure', async (req, res) => {
  const { platform, token, allowedUsers } = req.body;

  if (!platform || !token || !allowedUsers || allowedUsers.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields'
    });
  }

  if (platform !== 'telegram') {
    return res.status(400).json({
      success: false,
      error: 'Only Telegram platform is supported'
    });
  }

  try {
    // Save to config
    botService.config.set('telegram.enabled', true);
    botService.config.set('telegram.token', token);
    botService.config.set('telegram.allowedUsers', allowedUsers);

    // Set environment variables
    process.env.TELEGRAM_BOT_TOKEN = token;
    process.env.TELEGRAM_ALLOWED_USERS = allowedUsers.join(',');

    // Restart bot service with new config
    console.log('[BotService] Restarting Telegram bot...');
    await restartBotService();

    // Wait for connection (up to 10 seconds)
    let attempts = 0;
    while (attempts < 20 && !botService.telegram?.ready) {
      await new Promise(resolve => setTimeout(resolve, 500));
      attempts++;
    }

    // Send test message to user
    const userId = allowedUsers[0];
    let testSent = false;

    if (botService.telegram?.ready) {
      try {
        await botService.telegram.sendNotification(userId, {
          text: '🎉 VibeManager Bot Connected!\n\nYour Telegram bot is now configured and ready to use.\n\nTry these commands:\n/help - See all commands\n/list - List sessions\n/create my-test - Create a test session'
        });
        testSent = true;
      } catch (err) {
        console.error('[Bot] Failed to send test message:', err.message);
      }
    }

    if (testSent) {
      res.json({
        success: true,
        message: '✅ Bot configured successfully! Check your Telegram for a test message.'
      });
    } else {
      res.json({
        success: true,
        message: '⚠️ Bot is connecting... It may take a moment for the connection to establish. Try /help in Telegram.'
      });
    }
  } catch (err) {
    console.error('[Bot] Configuration error:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// --- Provider Configuration APIs ---

// Get provider configuration
app.get('/api/provider/config', (req, res) => {
  const config = botService.config.config;
  res.json({
    provider: config.provider?.name || '',
    baseUrl: config.provider?.baseUrl || '',
    apiKey: config.provider?.apiKey ? '***' + config.provider.apiKey.slice(-8) : '',
    customUrl: config.provider?.customUrl || '',
    model: config.provider?.model || '',
    detection: config.detection || { method: 'both', interval: 60 }
  });
});

// Configure provider
app.post('/api/provider/configure', (req, res) => {
  const { provider, baseUrl, apiKey, model } = req.body;

  if (!provider || !apiKey) {
    return res.status(400).json({ success: false, error: 'Provider and API key required' });
  }

  try {
    botService.config.set('provider.name', provider);
    botService.config.set('provider.baseUrl', baseUrl);
    botService.config.set('provider.apiKey', apiKey);
    botService.config.set('provider.model', model || '');

    if (provider === 'custom') {
      botService.config.set('provider.customUrl', baseUrl);
    }

    // Update summary generator config
    if (summaryGenerator) {
      summaryGenerator.configure({ baseUrl, apiKey, model });
    }

    res.json({ success: true, message: 'Provider configured successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Fetch models from provider
app.post('/api/provider/models', async (req, res) => {
  const { provider, baseUrl, apiKey } = req.body;

  if (!baseUrl || !apiKey) {
    return res.status(400).json({ success: false, error: 'Base URL and API key required' });
  }

  try {
    const https = require('https');
    const http = require('http');
    const url = new URL(baseUrl + '/models');
    const protocol = url.protocol === 'https:' ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    };

    const request = protocol.request(options, (response) => {
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.data && Array.isArray(json.data)) {
            const models = json.data.map(m => ({
              id: m.id,
              name: m.id.split('/').pop()
            })).sort((a, b) => a.name.localeCompare(b.name));
            res.json({ success: true, models });
          } else if (json.models && Array.isArray(json.models)) {
            const models = json.models.map(m => ({
              id: typeof m === 'string' ? m : m.id,
              name: typeof m === 'string' ? m : (m.name || m.id)
            })).sort((a, b) => a.name.localeCompare(b.name));
            res.json({ success: true, models });
          } else {
            res.json({ success: false, error: 'Unexpected response format' });
          }
        } catch (e) {
          res.json({ success: false, error: 'Failed to parse response: ' + e.message });
        }
      });
    });

    request.on('error', (err) => {
      res.json({ success: false, error: 'Request failed: ' + err.message });
    });

    request.on('timeout', () => {
      request.destroy();
      res.json({ success: false, error: 'Request timed out' });
    });

    request.end();
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Configure task detection settings
app.post('/api/provider/detection', (req, res) => {
  const { method, interval } = req.body;

  try {
    botService.config.set('detection.method', method || 'both');
    botService.config.set('detection.interval', Math.max(10, Math.min(300, interval || 60)));

    // Update ralph loop detection settings
    if (ralphLoop && ralphLoop.updateDetectionSettings) {
      ralphLoop.updateDetectionSettings({
        method: method || 'both',
        interval: Math.max(10, Math.min(300, interval || 60))
      });
    }

    res.json({ success: true, message: 'Detection settings saved' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Summary APIs ---

// Generate summary for a session
app.post('/api/sessions/:name/summary', async (req, res) => {
  const sessionName = req.params.name;
  const session = sessionManager.get(sessionName);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  if (!summaryGenerator.isConfigured()) {
    return res.status(400).json({ error: 'AI API not configured. Set baseUrl and apiKey in settings.' });
  }

  // Gather session data
  const scrollback = sessionManager.getScrollbackContent(sessionName, 'latest');
  const tasks = sessionManager.getTaskStats(sessionName);
  const conversationResult = conversationLinker.getConversationForSession(session.projectPath, { limit: 10 });

  const sessionData = {
    sessionName,
    projectName: session.projectPath.split('/').pop(),
    scrollback,
    tasks,
    conversation: conversationResult.found ? conversationResult.messages : []
  };

  const result = await summaryGenerator.generateSessionSummary(sessionData);

  if (!result.success) {
    return res.status(500).json({ error: result.error });
  }

  // Store summary in session metadata
  const meta = sessionManager.data.sessions[sessionName];
  if (meta) {
    meta.lastSummary = {
      content: result.summary,
      timestamp: result.timestamp
    };
    sessionManager.save();
  }

  res.json(result);
});

// Generate summary for a checkpoint
app.post('/api/sessions/:name/checkpoints/:id/summary', async (req, res) => {
  const sessionName = req.params.name;
  const checkpointId = req.params.id;

  if (!summaryGenerator.isConfigured()) {
    return res.status(400).json({ error: 'AI API not configured' });
  }

  const checkpoint = sessionManager.getCheckpoint(sessionName, checkpointId);
  if (!checkpoint) return res.status(404).json({ error: 'Checkpoint not found' });

  // Get scrollback at checkpoint time if available
  let scrollback = '';
  if (checkpoint.scrollback?.timestamp) {
    scrollback = sessionManager.getScrollbackContent(sessionName, checkpoint.scrollback.timestamp) || '';
  }

  const result = await summaryGenerator.generateCheckpointSummary({
    name: checkpoint.name,
    tasks: checkpoint.tasks,
    git: checkpoint.git,
    scrollback
  });

  if (!result.success) {
    return res.status(500).json({ error: result.error });
  }

  // Update checkpoint with summary
  const checkpointsDir = sessionManager.getCheckpointsDir(sessionName);
  const checkpointPath = path.join(checkpointsDir, `${checkpointId}.json`);
  checkpoint.summary = result.summary;
  fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2));

  res.json(result);
});

// --- Auto-capture scrollback for active sessions ---

const lastScrollbackCapture = new Map(); // sessionName -> timestamp
const SCROLLBACK_CAPTURE_INTERVAL = 5 * 60 * 1000; // 5 minutes

function autoCapureScrollback() {
  const sessions = sessionManager.list();
  const now = Date.now();

  for (const session of sessions) {
    if (!session.alive) continue;

    const lastCapture = lastScrollbackCapture.get(session.name) || 0;
    if (now - lastCapture >= SCROLLBACK_CAPTURE_INTERVAL) {
      const result = sessionManager.captureScrollback(session.name);
      if (result) {
        lastScrollbackCapture.set(session.name, now);
        // Cleanup old captures (keep last 20)
        sessionManager.cleanupScrollback(session.name, 20);
      }
    }
  }
}

// Run auto-capture check every minute
setInterval(autoCapureScrollback, 60 * 1000);

// --- Ralph Loop: Automatic completion detection ---

function checkRalphLoopCompletion() {
  const allLoops = ralphLoop.getAllLoopStatus();

  for (const [sessionName, loopStatus] of Object.entries(allLoops)) {
    if (loopStatus.status !== 'running') continue;

    const session = sessionManager.get(sessionName);
    if (!session || !session.alive) continue;

    const currentTask = sessionManager.getCurrentTask(sessionName);
    if (!currentTask) continue;

    let analysis = null;
    let validationResult = null;

    // PRIMARY: Check status file first (most reliable)
    const statusData = sessionManager.readStatusFile(sessionName);

    if (statusData) {
      // Run 4-layer validation
      validationResult = sessionManager.validateTaskCompletion(
        sessionName,
        currentTask.id,
        statusData
      );

      console.log(`[Ralph] Status file validation for ${sessionName}:`, {
        passed: validationResult.passed,
        status: statusData.status,
        progress: statusData.progress,
        layers: Object.entries(validationResult.layers).map(([k, v]) => `${k}:${v.valid}`).join(', ')
      });

      // Update task with status file data (even if validation incomplete)
      if (validationResult.layers.schema.valid) {
        const updates = {
          lastUpdatedAt: new Date().toISOString()
        };

        // Update status
        if (statusData.status) {
          updates.status = statusData.status;
        }

        // Update progress
        if (statusData.progress !== undefined) {
          updates.progress = statusData.progress;
        }

        // Update Claude task ID if provided
        if (statusData.claudeTaskId) {
          updates.claudeTaskId = statusData.claudeTaskId;
        }

        // Update current step
        if (statusData.currentStep && currentTask.steps) {
          const stepMatch = currentTask.steps.find(s =>
            statusData.currentStep.toLowerCase().includes(s.name)
          );
          if (stepMatch && stepMatch.status === 'pending') {
            stepMatch.status = 'in_progress';
            updates.steps = currentTask.steps;
          }
        }

        // Store validation results
        updates.validation = {
          syntaxValid: validationResult.layers.syntax.valid,
          schemaValid: validationResult.layers.schema.valid,
          semanticValid: validationResult.layers.semantic.valid,
          outcomeValid: validationResult.layers.outcome.valid,
          errors: [
            ...validationResult.layers.schema.errors,
            ...validationResult.layers.semantic.errors,
            ...validationResult.layers.outcome.errors
          ]
        };

        try {
          sessionManager.updateTask(sessionName, currentTask.id, updates);
        } catch (err) {
          console.error(`[Ralph] Failed to update task: ${err.message}`);
        }

        // Broadcast progress update to clients
        broadcastLoopEvent('task_progress', sessionName, {
          taskId: currentTask.id,
          status: statusData.status,
          progress: statusData.progress,
          currentStep: statusData.currentStep
        });
      }

      // If validation passed completely, mark as complete
      if (validationResult.passed && statusData.status === 'completed') {
        analysis = {
          completion: {
            isComplete: true,
            source: 'status_file',
            statusFile: statusData
          },
          stuck: { isStuck: false },
          validation: validationResult
        };
      } else if (statusData.status === 'error') {
        // Handle error status
        analysis = {
          completion: { isComplete: false, source: 'status_file' },
          stuck: {
            isStuck: true,
            errorCount: 1,
            errors: [{ type: 'task_error', message: statusData.error || 'Unknown error' }]
          }
        };
      }
    }

    // FALLBACK: Terminal scraping if no status file or validation failed
    if (!analysis) {
      sessionManager.captureScrollback(sessionName);
      analysis = sessionManager.analyzeSessionOutput(sessionName);
      if (!analysis) continue;

      console.log(`[Ralph] Terminal scraping for ${sessionName}: complete=${analysis.completion?.isComplete}, stuck=${analysis.stuck?.isStuck}`);
    }

    const isComplete = analysis.completion?.isComplete;
    const isStuck = analysis.stuck?.isStuck;

    // Process completion or stuck state
    if (isComplete || isStuck) {
      ralphLoop.processTaskCompletion(sessionName, analysis);

      // Clear status file after processing
      if (statusData) {
        sessionManager.clearStatusFile(sessionName);
        console.log(`[Ralph] Cleared status file for ${sessionName}`);
      }

      // Broadcast final update
      broadcastLoopEvent('ralph_update', sessionName, {
        analysis,
        loopState: ralphLoop.getLoopState(sessionName)
      });
    }
  }
}

// Check Ralph loops every 5 seconds (faster polling for file-based detection)
setInterval(checkRalphLoopCompletion, 5 * 1000);

// --- WebSocket: status push ---

const statusClients = new Set();

function getStatusPayload() {
  const sessions = sessionManager.list().map(s => {
    // Add task stats to each session
    const taskStats = sessionManager.getTaskStats(s.name);
    return {
      ...s,
      tasks: taskStats.total > 0 ? taskStats : undefined
    };
  });
  const running = sessions.filter(s => s.alive).length;
  return {
    type: 'status',
    stats: { total: sessions.length, running, stopped: sessions.length - running, uptime: Math.floor(process.uptime()) },
    sessions,
    system: sysCache || { cpu: { percent: 0, cores: 0 }, mem: { total: 0, used: 0, percent: 0 }, swap: { total: 0, used: 0, percent: 0 }, temp: 0, disk: { percent: 0, used: 0, total: 0 }, load: [0, 0, 0], net: { rx: 0, tx: 0 }, uptime: 0 },
    ports: portsCache
  };
}

// Push status to all connected status clients every 2s
setInterval(() => {
  if (statusClients.size === 0) return;
  const payload = JSON.stringify(getStatusPayload());
  for (const client of statusClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}, 2000);

// --- WebSocket: connection handler ---

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  // Status WebSocket
  if (path === '/status') {
    statusClients.add(ws);
    // Send initial payload immediately
    ws.send(JSON.stringify(getStatusPayload()));
    ws.on('close', () => statusClients.delete(ws));
    ws.on('error', () => statusClients.delete(ws));
    return;
  }

  // Terminal WebSocket
  const sessionName = url.searchParams.get('session');
  const cols = parseInt(url.searchParams.get('cols')) || 80;
  const rows = parseInt(url.searchParams.get('rows')) || 24;

  if (!sessionName) {
    ws.send(JSON.stringify({ type: 'error', message: 'session parameter required' }));
    ws.close();
    return;
  }

  const sessionMeta = sessionManager.get(sessionName);
  if (!sessionMeta) {
    ws.send(JSON.stringify({ type: 'error', message: `Session "${sessionName}" not found` }));
    ws.close();
    return;
  }

  // Revive if dead
  if (!sessionMeta.alive) {
    try {
      sessionManager.revive(sessionName);
    } catch (err) {
      ws.send(JSON.stringify({ type: 'error', message: `Cannot revive: ${err.message}` }));
      ws.close();
      return;
    }
  }

  // Track multi-tab
  if (!activeAttachments.has(sessionName)) activeAttachments.set(sessionName, new Set());
  activeAttachments.get(sessionName).add(ws);

  // Spawn tmux attach
  const term = pty.spawn(TMUX_BIN, ['attach', '-t', sessionMeta.tmuxSession], {
    name: 'xterm-256color',
    cols,
    rows,
    env: { ...process.env, COLORTERM: 'truecolor' }
  });

  const termId = `${sessionName}_${term.pid}`;
  terminals.set(termId, { term, sessionName, ws });

  ws.send(JSON.stringify({
    type: 'attached',
    session: sessionName,
    projectPath: sessionMeta.projectPath,
    shell: sessionMeta.shell
  }));

  sessionManager.touch(sessionName);

  term.onData(data => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'data', data }));
    }
  });

  term.onExit(({ exitCode }) => {
    terminals.delete(termId);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'detached',
        code: exitCode,
        reason: exitCode === 0 ? 'normal' : 'session_killed'
      }));
    }
  });

  ws.on('message', msg => {
    try {
      const parsed = JSON.parse(msg);
      if (parsed.type === 'data') {
        term.write(parsed.data);
      } else if (parsed.type === 'resize') {
        term.resize(parsed.cols, parsed.rows);
      }
    } catch {
      term.write(msg.toString());
    }
  });

  ws.on('close', () => {
    term.kill();
    terminals.delete(termId);
    const tabs = activeAttachments.get(sessionName);
    if (tabs) {
      tabs.delete(ws);
      if (tabs.size === 0) activeAttachments.delete(sessionName);
    }
  });
});

// Graceful shutdown: kill attach processes, NOT tmux sessions
process.on('SIGTERM', async () => {
  await botService.shutdown();
  terminals.forEach(({ term }) => term.kill());
  server.close();
  process.exit(0);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`VibeManager running at http://0.0.0.0:${PORT}`);
});
