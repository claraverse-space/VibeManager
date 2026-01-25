const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const pty = require('node-pty');
const path = require('path');
const fs = require('fs');
const net = require('net');
const { spawn, execSync } = require('child_process');
const SessionManager = require('./session-manager');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3131;
const CODE_PORT = process.env.CODE_PORT || 8083;
const TMUX_BIN = '/usr/bin/tmux';

// Start code-server for local installations (not in Docker)
let codeServerProcess = null;

function startCodeServer() {
  // Skip if running in Docker (code-server started separately)
  if (process.env.DOCKER === '1' || fs.existsSync('/.dockerenv')) {
    console.log('Running in Docker, code-server managed externally');
    return;
  }

  // Check if code-server is installed
  let codeServerPath = null;
  try {
    codeServerPath = execSync('which code-server 2>/dev/null', { encoding: 'utf-8' }).trim();
  } catch {
    console.log('code-server not installed, VS Code tab will be unavailable');
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
const terminals = new Map(); // termId -> { term, sessionName, ws }
const activeAttachments = new Map(); // sessionName -> Set<ws>

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

// --- WebSocket: status push ---

const statusClients = new Set();

function getStatusPayload() {
  const sessions = sessionManager.list();
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
process.on('SIGTERM', () => {
  terminals.forEach(({ term }) => term.kill());
  server.close();
  process.exit(0);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`VibeManager running at http://0.0.0.0:${PORT}`);
});
