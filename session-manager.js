const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TMUX_BIN = '/usr/bin/tmux';
const DATA_DIR = path.join(process.env.HOME, '.local/share/projectgenerator');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const SESSION_PREFIX = 'pg_';

class SessionManager {
  constructor() {
    this.ensureDataDir();
    this.data = this.load();
    this.reconcile();
  }

  ensureDataDir() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  load() {
    if (!fs.existsSync(SESSIONS_FILE)) {
      return { lastActiveSession: null, sessions: {} };
    }
    try {
      return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8'));
    } catch {
      return { lastActiveSession: null, sessions: {} };
    }
  }

  save() {
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(this.data, null, 2));
  }

  sanitizeTmuxName(name) {
    return SESSION_PREFIX + name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
  }

  tmuxSessionExists(tmuxName) {
    try {
      execSync(`${TMUX_BIN} has-session -t "${tmuxName}" 2>/dev/null`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  listLiveTmuxSessions() {
    try {
      const out = execSync(`${TMUX_BIN} list-sessions -F "#{session_name}" 2>/dev/null`);
      return out.toString().trim().split('\n').filter(s => s.startsWith(SESSION_PREFIX));
    } catch {
      return [];
    }
  }

  reconcile() {
    const live = this.listLiveTmuxSessions();
    for (const meta of Object.values(this.data.sessions)) {
      meta.alive = live.includes(meta.tmuxSession);
    }
    this.save();
  }

  create(name, projectPath, cols = 80, rows = 24, initialPrompt = '', shellChoice = 'auto', autonomous = true) {
    if (this.data.sessions[name]) {
      throw new Error(`Session "${name}" already exists`);
    }
    if (!fs.existsSync(projectPath)) {
      throw new Error('Project path does not exist');
    }

    const tmuxName = this.sanitizeTmuxName(name);
    if (this.tmuxSessionExists(tmuxName)) {
      throw new Error(`tmux session "${tmuxName}" already exists`);
    }

    // Determine shell
    let shell = shellChoice;
    if (shell === 'auto') {
      shell = 'bash';
      try { execSync('which opencode', { stdio: 'ignore' }); shell = 'opencode'; } catch {}
    }
    // Verify chosen tool exists
    if (shell === 'opencode') {
      try { execSync('which opencode', { stdio: 'ignore' }); } catch { shell = 'bash'; }
    } else if (shell === 'claude') {
      try { execSync('which claude', { stdio: 'ignore' }); } catch { shell = 'bash'; }
    }

    // Create detached tmux session
    execSync(
      `${TMUX_BIN} new-session -d -s "${tmuxName}" -c "${projectPath}" -x ${cols} -y ${rows}`
    );

    // Launch AI tool
    if (shell === 'opencode' || shell === 'claude') {
      const flag = autonomous ? ' --dangerously-skip-permissions' : '';
      execSync(`${TMUX_BIN} send-keys -t "${tmuxName}" "${shell}${flag}" Enter`);
      // Send initial prompt after tool starts up
      if (initialPrompt) {
        const safePrompt = initialPrompt.replace(/"/g, '\\"').replace(/\$/g, '\\$');
        setTimeout(() => {
          try {
            execSync(`${TMUX_BIN} send-keys -t "${tmuxName}" "${safePrompt}" Enter`);
          } catch {}
        }, 3000);
      }
    }

    const now = new Date().toISOString();
    this.data.sessions[name] = {
      name,
      projectPath,
      tmuxSession: tmuxName,
      shell,
      autonomous,
      initialPrompt: initialPrompt || undefined,
      createdAt: now,
      lastAccessedAt: now,
      alive: true
    };
    this.data.lastActiveSession = name;
    this.save();

    return this.data.sessions[name];
  }

  get(name) {
    const meta = this.data.sessions[name];
    if (!meta) return null;
    meta.alive = this.tmuxSessionExists(meta.tmuxSession);
    return { ...meta };
  }

  list() {
    const live = this.listLiveTmuxSessions();
    return Object.values(this.data.sessions).map(s => ({
      ...s,
      alive: live.includes(s.tmuxSession)
    }));
  }

  delete(name) {
    const meta = this.data.sessions[name];
    if (!meta) throw new Error(`Session "${name}" not found`);

    if (this.tmuxSessionExists(meta.tmuxSession)) {
      try {
        execSync(`${TMUX_BIN} kill-session -t "${meta.tmuxSession}"`);
      } catch {}
    }

    delete this.data.sessions[name];
    if (this.data.lastActiveSession === name) {
      const remaining = Object.keys(this.data.sessions);
      this.data.lastActiveSession = remaining.length > 0 ? remaining[0] : null;
    }
    this.save();
  }

  stop(name) {
    const meta = this.data.sessions[name];
    if (!meta) throw new Error(`Session "${name}" not found`);
    if (this.tmuxSessionExists(meta.tmuxSession)) {
      try {
        execSync(`${TMUX_BIN} kill-session -t "${meta.tmuxSession}"`);
      } catch {}
    }
    meta.alive = false;
    this.save();
  }

  revive(name) {
    const meta = this.data.sessions[name];
    if (!meta) throw new Error(`Session "${name}" not found`);

    if (this.tmuxSessionExists(meta.tmuxSession)) {
      meta.alive = true;
      return { ...meta };
    }

    const cols = 80;
    const rows = 24;

    execSync(
      `${TMUX_BIN} new-session -d -s "${meta.tmuxSession}" -c "${meta.projectPath}" -x ${cols} -y ${rows}`
    );

    if (meta.shell === 'opencode' || meta.shell === 'claude') {
      const flag = meta.autonomous !== false ? ' --dangerously-skip-permissions' : '';
      execSync(`${TMUX_BIN} send-keys -t "${meta.tmuxSession}" "${meta.shell}${flag}" Enter`);
      if (meta.initialPrompt) {
        const safePrompt = meta.initialPrompt.replace(/"/g, '\\"').replace(/\$/g, '\\$');
        setTimeout(() => {
          try {
            execSync(`${TMUX_BIN} send-keys -t "${meta.tmuxSession}" "${safePrompt}" Enter`);
          } catch {}
        }, 3000);
      }
    }

    meta.alive = true;
    meta.lastAccessedAt = new Date().toISOString();
    this.save();
    return { ...meta };
  }

  touch(name) {
    const meta = this.data.sessions[name];
    if (!meta) return;
    meta.lastAccessedAt = new Date().toISOString();
    this.data.lastActiveSession = name;
    this.save();
  }

  getLastActive() {
    return this.data.lastActiveSession;
  }
}

module.exports = SessionManager;
