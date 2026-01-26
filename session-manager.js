const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TMUX_BIN = '/usr/bin/tmux';
const DATA_DIR = path.join(process.env.HOME, '.local/share/projectgenerator');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const STATE_DIR = path.join(DATA_DIR, 'state');
const MEMORY_FILE = path.join(DATA_DIR, 'memory.json');
const SESSION_PREFIX = 'pg_';

// Common paths where claude/opencode might be installed
const TOOL_SEARCH_PATHS = [
  '/usr/bin',
  '/usr/local/bin',
  '/opt/homebrew/bin',
  path.join(process.env.HOME, '.local/bin'),
  path.join(process.env.HOME, '.npm-global/bin'),
  path.join(process.env.HOME, '.opencode/bin'),  // OpenCode default install location
  path.join(process.env.HOME, '.claude/bin'),    // Claude alternate location
  '/snap/bin'
];

function findTool(name) {
  // First try which
  try {
    const result = execSync(`which ${name} 2>/dev/null`, { encoding: 'utf-8' }).trim();
    if (result && fs.existsSync(result)) return result;
  } catch {}

  // Search common paths
  for (const dir of TOOL_SEARCH_PATHS) {
    const fullPath = path.join(dir, name);
    if (fs.existsSync(fullPath)) return fullPath;
  }
  return null;
}

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

    // Determine shell and find tool path
    let shell = shellChoice;
    let toolPath = null;

    if (shell === 'auto') {
      // Try opencode first, then claude, then bash
      toolPath = findTool('opencode');
      if (toolPath) {
        shell = 'opencode';
      } else {
        toolPath = findTool('claude');
        if (toolPath) {
          shell = 'claude';
        } else {
          shell = 'bash';
        }
      }
    } else if (shell === 'opencode') {
      toolPath = findTool('opencode');
      if (!toolPath) shell = 'bash';
    } else if (shell === 'claude') {
      toolPath = findTool('claude');
      if (!toolPath) shell = 'bash';
    }

    // Create detached tmux session
    execSync(
      `${TMUX_BIN} new-session -d -s "${tmuxName}" -c "${projectPath}" -x ${cols} -y ${rows}`
    );

    // Launch AI tool with full path
    if ((shell === 'opencode' || shell === 'claude') && toolPath) {
      // Only Claude supports --dangerously-skip-permissions flag
      const flag = (autonomous && shell === 'claude') ? ' --dangerously-skip-permissions' : '';
      execSync(`${TMUX_BIN} send-keys -t "${tmuxName}" "${toolPath}${flag}" Enter`);
      // Send Enter after delay to skip first-time setup prompts
      setTimeout(() => {
        try {
          execSync(`${TMUX_BIN} send-keys -t "${tmuxName}" Enter`);
        } catch {}
      }, 2000);
      // Send initial prompt after tool starts up
      if (initialPrompt) {
        const safePrompt = initialPrompt.replace(/"/g, '\\"').replace(/\$/g, '\\$');
        // Wait longer for Claude to be fully ready (5 seconds)
        setTimeout(() => {
          try {
            execSync(`${TMUX_BIN} send-keys -t "${tmuxName}" "${safePrompt}"`);
          } catch {}
        }, 5000);
        // Send Enter separately to submit the prompt (6 seconds)
        setTimeout(() => {
          try {
            execSync(`${TMUX_BIN} send-keys -t "${tmuxName}" Enter`);
          } catch {}
        }, 6000);
        // Send another Enter in case multiline mode needs it (7 seconds)
        setTimeout(() => {
          try {
            execSync(`${TMUX_BIN} send-keys -t "${tmuxName}" Enter`);
          } catch {}
        }, 7000);
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
      const toolPath = findTool(meta.shell);
      if (toolPath) {
        const flag = meta.autonomous !== false ? ' --dangerously-skip-permissions' : '';
        execSync(`${TMUX_BIN} send-keys -t "${meta.tmuxSession}" "${toolPath}${flag}" Enter`);
        // Send Enter after delay to skip first-time setup prompts
        setTimeout(() => {
          try {
            execSync(`${TMUX_BIN} send-keys -t "${meta.tmuxSession}" Enter`);
          } catch {}
        }, 2000);
        if (meta.initialPrompt) {
          const safePrompt = meta.initialPrompt.replace(/"/g, '\\"').replace(/\$/g, '\\$');
          // Wait longer for Claude to be fully ready (5 seconds)
          setTimeout(() => {
            try {
              execSync(`${TMUX_BIN} send-keys -t "${meta.tmuxSession}" "${safePrompt}"`);
            } catch {}
          }, 5000);
          // Send Enter separately to submit the prompt (6 seconds)
          setTimeout(() => {
            try {
              execSync(`${TMUX_BIN} send-keys -t "${meta.tmuxSession}" Enter`);
            } catch {}
          }, 6000);
          // Send another Enter in case multiline mode needs it (7 seconds)
          setTimeout(() => {
            try {
              execSync(`${TMUX_BIN} send-keys -t "${meta.tmuxSession}" Enter`);
            } catch {}
          }, 7000);
        }
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

  // --- State Management ---

  ensureStateDir(sessionName) {
    const sessionStateDir = path.join(STATE_DIR, sessionName);
    const scrollbackDir = path.join(sessionStateDir, 'scrollback');
    const checkpointsDir = path.join(sessionStateDir, 'checkpoints');
    fs.mkdirSync(scrollbackDir, { recursive: true });
    fs.mkdirSync(checkpointsDir, { recursive: true });
    return { sessionStateDir, scrollbackDir, checkpointsDir };
  }

  // --- Scrollback Capture ---

  captureScrollback(sessionName) {
    const meta = this.data.sessions[sessionName];
    if (!meta) return null;
    if (!this.tmuxSessionExists(meta.tmuxSession)) return null;

    const { scrollbackDir } = this.ensureStateDir(sessionName);
    const timestamp = Date.now();
    const filename = `${timestamp}.txt`;
    const filepath = path.join(scrollbackDir, filename);

    try {
      // Capture full scrollback buffer (up to 10000 lines)
      // Using execSync with fixed args (no user input in command string)
      const buffer = execSync(
        `${TMUX_BIN} capture-pane -t "${meta.tmuxSession}" -p -S -10000 2>/dev/null`,
        { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
      );
      fs.writeFileSync(filepath, buffer);

      // Update latest symlink
      const latestPath = path.join(scrollbackDir, 'latest.txt');
      try {
        if (fs.existsSync(latestPath) || fs.lstatSync(latestPath).isSymbolicLink()) {
          fs.unlinkSync(latestPath);
        }
      } catch {}
      fs.symlinkSync(filename, latestPath);

      return {
        timestamp,
        filename,
        path: filepath,
        size: buffer.length,
        lines: buffer.split('\n').length
      };
    } catch (e) {
      return null;
    }
  }

  getScrollbackHistory(sessionName) {
    const meta = this.data.sessions[sessionName];
    if (!meta) return [];

    const scrollbackDir = path.join(STATE_DIR, sessionName, 'scrollback');
    if (!fs.existsSync(scrollbackDir)) return [];

    try {
      const files = fs.readdirSync(scrollbackDir)
        .filter(f => f.endsWith('.txt') && f !== 'latest.txt')
        .map(f => {
          const filepath = path.join(scrollbackDir, f);
          const stat = fs.statSync(filepath);
          const timestamp = parseInt(f.replace('.txt', ''));
          return {
            filename: f,
            timestamp,
            date: new Date(timestamp).toISOString(),
            size: stat.size
          };
        })
        .sort((a, b) => b.timestamp - a.timestamp); // Most recent first
      return files;
    } catch {
      return [];
    }
  }

  getScrollbackContent(sessionName, timestamp) {
    const meta = this.data.sessions[sessionName];
    if (!meta) return null;

    const scrollbackDir = path.join(STATE_DIR, sessionName, 'scrollback');
    let filepath;

    if (timestamp === 'latest') {
      filepath = path.join(scrollbackDir, 'latest.txt');
    } else {
      filepath = path.join(scrollbackDir, `${timestamp}.txt`);
    }

    if (!fs.existsSync(filepath)) return null;

    try {
      return fs.readFileSync(filepath, 'utf-8');
    } catch {
      return null;
    }
  }

  deleteScrollback(sessionName, timestamp) {
    const meta = this.data.sessions[sessionName];
    if (!meta) return false;

    const scrollbackDir = path.join(STATE_DIR, sessionName, 'scrollback');
    const filepath = path.join(scrollbackDir, `${timestamp}.txt`);

    if (!fs.existsSync(filepath)) return false;

    try {
      fs.unlinkSync(filepath);
      return true;
    } catch {
      return false;
    }
  }

  // Cleanup old scrollback files (keep last N)
  cleanupScrollback(sessionName, keepCount = 20) {
    const history = this.getScrollbackHistory(sessionName);
    if (history.length <= keepCount) return 0;

    const toDelete = history.slice(keepCount);
    let deleted = 0;
    for (const file of toDelete) {
      if (this.deleteScrollback(sessionName, file.timestamp)) {
        deleted++;
      }
    }
    return deleted;
  }

  // --- Task Tracking (prd.json) ---

  getPrdPath(sessionName) {
    return path.join(STATE_DIR, sessionName, 'prd.json');
  }

  loadPrd(sessionName) {
    const prdPath = this.getPrdPath(sessionName);
    if (!fs.existsSync(prdPath)) {
      return null;
    }
    try {
      return JSON.parse(fs.readFileSync(prdPath, 'utf-8'));
    } catch {
      return null;
    }
  }

  savePrd(sessionName, prd) {
    this.ensureStateDir(sessionName);
    const prdPath = this.getPrdPath(sessionName);
    fs.writeFileSync(prdPath, JSON.stringify(prd, null, 2));
  }

  initPrd(sessionName, name, description, stories = []) {
    const meta = this.data.sessions[sessionName];
    if (!meta) throw new Error(`Session "${sessionName}" not found`);

    const prd = {
      name: name || sessionName,
      description: description || '',
      createdAt: new Date().toISOString(),
      stories: stories.map((s, i) => ({
        id: s.id || `story-${i + 1}`,
        title: s.title,
        description: s.description || '',
        passes: false,
        attempts: 0,
        createdAt: new Date().toISOString(),
        // New fields for enhanced tracking
        status: 'pending', // pending, in_progress, completed, blocked, error
        progress: 0,
        claudeTaskId: null,
        startedAt: null,
        lastUpdatedAt: null,
        steps: this.initializeTaskSteps(s),
        validation: {
          syntaxValid: null,
          schemaValid: null,
          semanticValid: null,
          outcomeValid: null,
          errors: []
        }
      }))
    };

    this.savePrd(sessionName, prd);

    // Update session metadata
    meta.mode = 'ralph';
    meta.tasks = {
      total: prd.stories.length,
      completed: 0,
      current: prd.stories.length > 0 ? prd.stories[0].title : null
    };
    this.save();

    return prd;
  }

  // Initialize task steps with default weights
  initializeTaskSteps(task) {
    return [
      { name: 'analyze', status: 'pending', weight: 10 },
      { name: 'implement', status: 'pending', weight: 50 },
      { name: 'test', status: 'pending', weight: 15 },
      { name: 'commit', status: 'pending', weight: 10 },
      { name: 'verify', status: 'pending', weight: 15 }
    ];
  }

  getTasks(sessionName) {
    const prd = this.loadPrd(sessionName);
    if (!prd) return [];
    return prd.stories;
  }

  getTask(sessionName, storyId) {
    const prd = this.loadPrd(sessionName);
    if (!prd) return null;
    return prd.stories.find(s => s.id === storyId) || null;
  }

  addTask(sessionName, title, description = '') {
    const meta = this.data.sessions[sessionName];
    if (!meta) throw new Error(`Session "${sessionName}" not found`);

    let prd = this.loadPrd(sessionName);
    if (!prd) {
      prd = {
        name: sessionName,
        description: '',
        createdAt: new Date().toISOString(),
        stories: []
      };
    }

    const nextId = prd.stories.length + 1;
    const story = {
      id: `story-${nextId}`,
      title,
      description,
      passes: false,
      attempts: 0,
      createdAt: new Date().toISOString()
    };

    prd.stories.push(story);
    this.savePrd(sessionName, prd);

    // Update session metadata
    meta.mode = 'ralph';
    meta.tasks = {
      total: prd.stories.length,
      completed: prd.stories.filter(s => s.passes).length,
      current: this.getCurrentTask(sessionName)?.title || null
    };
    this.save();

    return story;
  }

  updateTask(sessionName, storyId, updates) {
    const meta = this.data.sessions[sessionName];
    if (!meta) throw new Error(`Session "${sessionName}" not found`);

    const prd = this.loadPrd(sessionName);
    if (!prd) throw new Error('No tasks defined for this session');

    const story = prd.stories.find(s => s.id === storyId);
    if (!story) throw new Error(`Task "${storyId}" not found`);

    // Apply updates (including new fields)
    if (updates.title !== undefined) story.title = updates.title;
    if (updates.description !== undefined) story.description = updates.description;
    if (updates.passes !== undefined) {
      story.passes = updates.passes;
      if (updates.passes) {
        story.completedAt = new Date().toISOString();
      } else {
        delete story.completedAt;
      }
    }
    if (updates.attempts !== undefined) story.attempts = updates.attempts;

    // New fields
    if (updates.status !== undefined) story.status = updates.status;
    if (updates.progress !== undefined) story.progress = updates.progress;
    if (updates.claudeTaskId !== undefined) story.claudeTaskId = updates.claudeTaskId;
    if (updates.startedAt !== undefined) story.startedAt = updates.startedAt;
    if (updates.lastUpdatedAt !== undefined) story.lastUpdatedAt = updates.lastUpdatedAt;
    if (updates.steps !== undefined) story.steps = updates.steps;
    if (updates.validation !== undefined) story.validation = updates.validation;

    this.savePrd(sessionName, prd);

    // Update session metadata
    meta.tasks = {
      total: prd.stories.length,
      completed: prd.stories.filter(s => s.passes).length,
      current: this.getCurrentTask(sessionName)?.title || null
    };
    this.save();

    return story;
  }

  deleteTask(sessionName, storyId) {
    const meta = this.data.sessions[sessionName];
    if (!meta) throw new Error(`Session "${sessionName}" not found`);

    const prd = this.loadPrd(sessionName);
    if (!prd) throw new Error('No tasks defined for this session');

    const index = prd.stories.findIndex(s => s.id === storyId);
    if (index === -1) throw new Error(`Task "${storyId}" not found`);

    prd.stories.splice(index, 1);
    this.savePrd(sessionName, prd);

    // Update session metadata
    meta.tasks = {
      total: prd.stories.length,
      completed: prd.stories.filter(s => s.passes).length,
      current: this.getCurrentTask(sessionName)?.title || null
    };
    this.save();

    return true;
  }

  getCurrentTask(sessionName) {
    const prd = this.loadPrd(sessionName);
    if (!prd) return null;
    return prd.stories.find(s => !s.passes) || null;
  }

  markTaskComplete(sessionName, storyId) {
    return this.updateTask(sessionName, storyId, { passes: true });
  }

  incrementTaskAttempts(sessionName, storyId) {
    const task = this.getTask(sessionName, storyId);
    if (!task) return null;
    return this.updateTask(sessionName, storyId, { attempts: (task.attempts || 0) + 1 });
  }

  // Update task status
  updateTaskStatus(sessionName, storyId, status) {
    const validStatuses = ['pending', 'in_progress', 'completed', 'blocked', 'error'];
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }

    const updates = { status, lastUpdatedAt: new Date().toISOString() };

    // Auto-set special fields based on status
    if (status === 'in_progress' && !this.getTask(sessionName, storyId).startedAt) {
      updates.startedAt = new Date().toISOString();
    }
    if (status === 'completed') {
      updates.progress = 100;
      updates.passes = true;
    }

    return this.updateTask(sessionName, storyId, updates);
  }

  // Update task progress percentage
  updateTaskProgress(sessionName, storyId, progress, currentStep = null) {
    const updates = {
      progress: Math.max(0, Math.min(100, progress)),
      lastUpdatedAt: new Date().toISOString()
    };

    if (currentStep) {
      // Update step status
      const task = this.getTask(sessionName, storyId);
      if (task && task.steps) {
        const step = task.steps.find(s => s.name === currentStep);
        if (step && step.status === 'pending') {
          step.status = 'in_progress';
          updates.steps = task.steps;
        }
      }
    }

    return this.updateTask(sessionName, storyId, updates);
  }

  // Calculate task progress based on completed steps
  calculateTaskProgress(task) {
    if (!task.steps || task.steps.length === 0) return 0;

    const totalWeight = task.steps.reduce((sum, step) => sum + step.weight, 0);
    const completedWeight = task.steps
      .filter(step => step.status === 'completed')
      .reduce((sum, step) => sum + step.weight, 0);

    const inProgressWeight = task.steps
      .filter(step => step.status === 'in_progress')
      .reduce((sum, step) => sum + (step.weight * 0.5), 0); // Half credit for in-progress

    return Math.round(((completedWeight + inProgressWeight) / totalWeight) * 100);
  }

  // Update step status
  updateStepStatus(sessionName, storyId, stepName, status) {
    const task = this.getTask(sessionName, storyId);
    if (!task) throw new Error(`Task "${storyId}" not found`);
    if (!task.steps) throw new Error('Task has no steps defined');

    const step = task.steps.find(s => s.name === stepName);
    if (!step) throw new Error(`Step "${stepName}" not found`);

    step.status = status;

    // Recalculate progress
    const progress = this.calculateTaskProgress(task);

    return this.updateTask(sessionName, storyId, {
      steps: task.steps,
      progress,
      lastUpdatedAt: new Date().toISOString()
    });
  }

  getTaskStats(sessionName) {
    const prd = this.loadPrd(sessionName);
    if (!prd) return { total: 0, completed: 0, pending: 0, current: null };

    const completed = prd.stories.filter(s => s.passes).length;
    const current = this.getCurrentTask(sessionName);

    return {
      total: prd.stories.length,
      completed,
      pending: prd.stories.length - completed,
      current: current ? current.title : null,
      currentId: current ? current.id : null
    };
  }

  // --- Progress Tracking (progress.txt) ---

  getProgressPath(sessionName) {
    return path.join(STATE_DIR, sessionName, 'progress.txt');
  }

  appendProgress(sessionName, learning, category = 'info') {
    const meta = this.data.sessions[sessionName];
    if (!meta) return false;

    this.ensureStateDir(sessionName);
    const progressPath = this.getProgressPath(sessionName);

    const timestamp = new Date().toISOString();
    const entry = `[${timestamp}] [${category.toUpperCase()}] ${learning}\n`;

    try {
      fs.appendFileSync(progressPath, entry);
      return true;
    } catch {
      return false;
    }
  }

  getProgress(sessionName) {
    const progressPath = this.getProgressPath(sessionName);
    if (!fs.existsSync(progressPath)) return [];

    try {
      const content = fs.readFileSync(progressPath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);

      return lines.map(line => {
        // Parse: [2026-01-26T10:00:00.000Z] [INFO] Learning text
        const match = line.match(/^\[([^\]]+)\]\s*\[([^\]]+)\]\s*(.*)$/);
        if (match) {
          return {
            timestamp: match[1],
            category: match[2].toLowerCase(),
            content: match[3]
          };
        }
        return { timestamp: null, category: 'unknown', content: line };
      });
    } catch {
      return [];
    }
  }

  getProgressRaw(sessionName) {
    const progressPath = this.getProgressPath(sessionName);
    if (!fs.existsSync(progressPath)) return '';

    try {
      return fs.readFileSync(progressPath, 'utf-8');
    } catch {
      return '';
    }
  }

  clearProgress(sessionName) {
    const progressPath = this.getProgressPath(sessionName);
    if (!fs.existsSync(progressPath)) return true;

    try {
      fs.unlinkSync(progressPath);
      return true;
    } catch {
      return false;
    }
  }

  // Log different types of progress
  logTaskStart(sessionName, taskTitle) {
    return this.appendProgress(sessionName, `Started task: "${taskTitle}"`, 'task');
  }

  logTaskComplete(sessionName, taskTitle) {
    return this.appendProgress(sessionName, `Completed task: "${taskTitle}"`, 'success');
  }

  logTaskFailed(sessionName, taskTitle, reason) {
    return this.appendProgress(sessionName, `Failed task: "${taskTitle}" - ${reason}`, 'error');
  }

  logLearning(sessionName, learning) {
    return this.appendProgress(sessionName, learning, 'learning');
  }

  logError(sessionName, error) {
    return this.appendProgress(sessionName, error, 'error');
  }

  logIteration(sessionName, iterationNumber) {
    return this.appendProgress(sessionName, `Starting iteration ${iterationNumber}`, 'iteration');
  }

  logCheckpoint(sessionName, checkpointName) {
    return this.appendProgress(sessionName, `Created checkpoint: "${checkpointName}"`, 'checkpoint');
  }

  // Extract learnings from output (simple heuristics)
  extractLearnings(output) {
    const learnings = [];

    // Error patterns
    const errorPatterns = [
      /error:\s*(.+)/gi,
      /exception:\s*(.+)/gi,
      /failed:\s*(.+)/gi,
      /cannot\s+(.+)/gi,
      /unable to\s+(.+)/gi
    ];

    for (const pattern of errorPatterns) {
      let match;
      while ((match = pattern.exec(output)) !== null) {
        learnings.push({ type: 'error', content: match[1].trim().substring(0, 200) });
      }
    }

    // Decision patterns
    const decisionPatterns = [
      /i('ll| will)\s+(.+)/gi,
      /decided to\s+(.+)/gi,
      /choosing\s+(.+)/gi,
      /using\s+(\w+)\s+(for|to|because)/gi
    ];

    for (const pattern of decisionPatterns) {
      let match;
      while ((match = pattern.exec(output)) !== null) {
        const content = match[2] || match[1];
        if (content && content.length > 10) {
          learnings.push({ type: 'decision', content: content.trim().substring(0, 200) });
        }
      }
    }

    return learnings;
  }

  // --- Exit Detection ---

  // Layer 1: Syntax validation (valid JSON)
  validateStatusFileSyntax(content) {
    try {
      const parsed = JSON.parse(content);
      return { valid: true, parsed };
    } catch (err) {
      return { valid: false, error: `Invalid JSON: ${err.message}` };
    }
  }

  // Layer 2: Schema validation (required fields, correct types)
  validateStatusFileSchema(statusData) {
    const errors = [];

    if (!statusData.version) errors.push('Missing required field: version');
    if (!statusData.status) errors.push('Missing required field: status');
    if (!statusData.task) errors.push('Missing required field: task');
    if (statusData.timestamp === undefined) errors.push('Missing required field: timestamp');

    if (statusData.status && !['in_progress', 'completed', 'error', 'blocked'].includes(statusData.status)) {
      errors.push(`Invalid status value: ${statusData.status}`);
    }
    if (statusData.progress !== undefined && (typeof statusData.progress !== 'number' || statusData.progress < 0 || statusData.progress > 100)) {
      errors.push('progress must be a number between 0 and 100');
    }

    return { valid: errors.length === 0, errors };
  }

  // Layer 3: Semantic validation (logical consistency)
  validateStatusFileSemantic(statusData) {
    const errors = [];

    if (statusData.status === 'completed' && !statusData.result) {
      errors.push('Status "completed" requires result object');
    }
    if (statusData.status === 'error' && !statusData.error) {
      errors.push('Status "error" requires error message');
    }
    if (statusData.status === 'completed' && statusData.progress !== undefined && statusData.progress !== 100) {
      errors.push('Completed tasks should have progress: 100');
    }

    return { valid: errors.length === 0, errors };
  }

  // Layer 4: Outcome validation (verify git commits, tests, artifacts)
  validateStatusFileOutcome(sessionName, statusData) {
    const errors = [];
    const meta = this.data.sessions[sessionName];
    if (!meta) return { valid: false, errors: ['Session not found'] };

    if (statusData.status !== 'completed') {
      return { valid: true, errors: [] };
    }

    if (!statusData.result) {
      return { valid: true, errors: [] };
    }

    // Always pass - outcome validation is informational only
    return { valid: true, errors };
  }

  // Full 4-layer validation
  validateTaskCompletion(sessionName, taskId, statusData) {
    const validation = {
      passed: false,
      layers: {
        syntax: { valid: true, errors: [] },
        schema: { valid: false, errors: [] },
        semantic: { valid: false, errors: [] },
        outcome: { valid: false, errors: [] }
      }
    };

    validation.layers.schema = this.validateStatusFileSchema(statusData);
    if (!validation.layers.schema.valid) {
      return validation;
    }

    validation.layers.semantic = this.validateStatusFileSemantic(statusData);
    validation.layers.outcome = this.validateStatusFileOutcome(sessionName, statusData);

    validation.passed =
      validation.layers.syntax.valid &&
      validation.layers.schema.valid &&
      validation.layers.semantic.valid;

    return validation;
  }

  // Enhanced: Read and validate status file
  readStatusFile(sessionName) {
    const meta = this.data.sessions[sessionName];
    if (!meta) return null;

    const statusFile = path.join(meta.projectPath, '.ralph', 'status.json');

    if (!fs.existsSync(statusFile)) {
      return null;
    }

    try {
      const content = fs.readFileSync(statusFile, 'utf-8');

      // Layer 1: Syntax validation
      const syntaxResult = this.validateStatusFileSyntax(content);
      if (!syntaxResult.valid) {
        console.error(`[SessionManager] Status file syntax error: ${syntaxResult.error}`);
        return null;
      }

      const statusData = syntaxResult.parsed;
      statusData._fileMtime = fs.statSync(statusFile).mtime;

      return statusData;
    } catch (err) {
      console.error(`[SessionManager] Failed to read status file: ${err.message}`);
      return null;
    }
  }

  // Check .ralph/status.json file for task status (most reliable method)
  // DEPRECATED: Use readStatusFile() instead for enhanced validation
  checkStatusFile(sessionName) {
    const statusData = this.readStatusFile(sessionName);
    if (!statusData) return null;

    // Return in legacy format for backwards compatibility
    return {
      status: statusData.status,
      taskId: statusData.task,
      progress: statusData.progress || null,
      error: statusData.error || null,
      timestamp: statusData._fileMtime
    };
  }

  // Clear the status file after processing
  clearStatusFile(sessionName) {
    const meta = this.data.sessions[sessionName];
    if (!meta) return;

    const statusFile = path.join(meta.projectPath, '.ralph', 'status.json');
    if (fs.existsSync(statusFile)) {
      try {
        fs.unlinkSync(statusFile);
      } catch {}
    }
  }

  // Completion signal patterns (terminal scraping - Ralph-style)
  detectCompletion(output) {
    const result = {
      isComplete: false,
      explicitSignal: false,
      heuristicIndicators: 0,
      signals: []
    };

    // VERIFICATION responses (high priority - from stuck task verification)
    if (/VERIFICATION:\s*TASK\s*COMPLETED/i.test(output)) {
      result.explicitSignal = true;
      result.isComplete = true;
      result.signals.push('verification_completed');
      return result; // Return immediately - this is definitive
    }

    if (/VERIFICATION:\s*TASK\s*BLOCKED/i.test(output)) {
      result.explicitSignal = false;
      result.isComplete = false;
      result.signals.push('verification_blocked');
      return result; // Return immediately - task is blocked, not complete
    }

    // Ralph-style explicit signal: Look for "DONE" at the end of response
    // Must appear after Claude's response markers (● or ✶) to avoid matching prompt

    // Pattern 1: Standalone DONE on its own line (most reliable)
    // Allow for content after DONE (like "Cooked for" markers)
    if (/\n\s*DONE\s*\n/m.test(output) || /\n\s*DONE\s*$/m.test(output)) {
      result.explicitSignal = true;
      result.signals.push('done_signal');
    }

    // Pattern 2: DONE after completion phrases
    if (/task.*complete[.\s]*DONE/i.test(output)) {
      result.explicitSignal = true;
      result.signals.push('task_complete_done');
    }

    // Pattern 3: DONE followed by Claude thinking marker
    if (/DONE\s*\n*\s*✻.*Cooked/m.test(output)) {
      result.explicitSignal = true;
      result.signals.push('done_with_thinking');
    }

    // Pattern 3: Look for "Churned for" or "Concocting" completion (Claude stopped thinking)
    // Plus natural completion language
    const claudeFinishedThinking = /✶\s*(Churned|Concocted|Contemplated|Fiddled)/i.test(output);

    if (claudeFinishedThinking) {
      // Look for completion indicators in the response body (before the thinking marker)
      const beforeThinking = output.split(/✶\s*(Churned|Concocted|Contemplated|Fiddled)/i)[0];

      const completionPhrases = [
        /●.*commit has been made/i,
        /●.*deployed.*successfully/i,
        /●.*running.*port/i,
        /●.*(built|created|implemented).*successfully/i,
        /●.*everything.*working/i,
        /●.*features?.*complete/i,
        /git commit.*\[master/i,
        /test.*passed/i
      ];

      let matchedPhrases = 0;
      for (const phrase of completionPhrases) {
        if (phrase.test(beforeThinking)) {
          matchedPhrases++;
          result.signals.push(phrase.source || 'completion_phrase');
        }
      }

      // If Claude finished thinking AND has 2+ completion phrases, likely done
      if (matchedPhrases >= 2) {
        result.heuristicIndicators = matchedPhrases;
        result.signals.push('claude_finished_thinking');
      }
    }

    // High threshold: explicit DONE signal OR (Claude stopped + 2+ indicators)
    result.isComplete = result.explicitSignal || (claudeFinishedThinking && result.heuristicIndicators >= 2);

    return result;
  }

  // Check if output indicates an error/stuck state
  detectStuckState(output) {
    const result = {
      isStuck: false,
      errorCount: 0,
      errors: []
    };

    // Error patterns that indicate being stuck
    const stuckPatterns = [
      { pattern: /error:\s*(.{10,100})/gi, name: 'error' },
      { pattern: /failed:\s*(.{10,100})/gi, name: 'failed' },
      { pattern: /cannot\s+(.{10,100})/gi, name: 'cannot' },
      { pattern: /permission\s+denied/gi, name: 'permission_denied' },
      { pattern: /not\s+found/gi, name: 'not_found' },
      { pattern: /timeout/gi, name: 'timeout' },
      { pattern: /rate\s+limit/gi, name: 'rate_limit' }
    ];

    for (const { pattern, name } of stuckPatterns) {
      let match;
      while ((match = pattern.exec(output)) !== null) {
        result.errorCount++;
        result.errors.push({
          type: name,
          message: match[1] ? match[1].trim() : match[0]
        });
      }
    }

    // Consider stuck if 3+ errors detected
    result.isStuck = result.errorCount >= 3;

    return result;
  }

  // Check if output indicates waiting for input
  detectWaitingForInput(output) {
    const waitingPatterns = [
      /waiting\s+for\s+(your\s+)?(input|response)/i,
      /please\s+(provide|enter|type)/i,
      /\?\s*$/m,  // Ends with question mark
      /what\s+would\s+you\s+like/i,
      /how\s+should\s+i\s+proceed/i
    ];

    for (const pattern of waitingPatterns) {
      if (pattern.test(output)) {
        return true;
      }
    }

    return false;
  }

  // Analyze current session output - terminal scraping (Ralph-style)
  analyzeSessionOutput(sessionName) {
    const scrollback = this.getScrollbackContent(sessionName, 'latest');
    if (!scrollback) {
      // Try to capture fresh scrollback
      this.captureScrollback(sessionName);
      const freshScrollback = this.getScrollbackContent(sessionName, 'latest');
      if (!freshScrollback) return null;
      return this.analyzeOutput(freshScrollback);
    }
    return this.analyzeOutput(scrollback);
  }

  analyzeOutput(output) {
    // Only analyze last portion of output (most recent activity)
    const recentOutput = output.slice(-8000);

    // Separate prompt from Claude's response
    // Claude's responses start with ● or after the prompt separator line
    // Look for the last occurrence of the prompt start (## Instructions:)
    const promptEnd = recentOutput.lastIndexOf('## Instructions:');

    let claudeResponse = recentOutput;
    if (promptEnd > 0) {
      // Find where Claude's response starts (after the prompt)
      // Look for the separator line or first ● after prompt
      const afterPrompt = recentOutput.slice(promptEnd);
      const separatorMatch = afterPrompt.match(/─{10,}/);
      if (separatorMatch) {
        const responseStart = promptEnd + separatorMatch.index + separatorMatch[0].length;
        claudeResponse = recentOutput.slice(responseStart);
      }
    }

    // If we couldn't find separator, try to find first ● which indicates Claude started responding
    if (claudeResponse === recentOutput) {
      const firstAction = claudeResponse.indexOf('●');
      if (firstAction > 0) {
        claudeResponse = claudeResponse.slice(firstAction);
      }
    }

    // Debug: Check if DONE is in the response
    if (claudeResponse.includes('DONE')) {
      console.log(`[Debug] DONE found in response (length: ${claudeResponse.length})`);
      console.log(`[Debug] Last 200 chars:`, claudeResponse.slice(-200));
    }

    const completion = this.detectCompletion(claudeResponse);
    const stuck = this.detectStuckState(claudeResponse);
    const waitingForInput = this.detectWaitingForInput(claudeResponse);
    const learnings = this.extractLearnings(claudeResponse);

    return {
      completion: { ...completion, source: 'terminal_scraping' },
      stuck,
      waitingForInput,
      learnings,
      timestamp: new Date().toISOString()
    };
  }

  // --- Checkpoints ---

  getCheckpointsDir(sessionName) {
    return path.join(STATE_DIR, sessionName, 'checkpoints');
  }

  createCheckpoint(sessionName, name, description = '', trigger = 'manual') {
    const meta = this.data.sessions[sessionName];
    if (!meta) throw new Error(`Session "${sessionName}" not found`);

    this.ensureStateDir(sessionName);
    const checkpointsDir = this.getCheckpointsDir(sessionName);

    const id = `chk_${Date.now()}`;
    const timestamp = new Date().toISOString();

    // Capture current scrollback
    const scrollbackResult = this.captureScrollback(sessionName);

    // Get git state
    let git = null;
    try {
      const gitBranch = execSync(`git -C "${meta.projectPath}" rev-parse --abbrev-ref HEAD 2>/dev/null`, { encoding: 'utf-8' }).trim();
      const gitCommit = execSync(`git -C "${meta.projectPath}" rev-parse --short HEAD 2>/dev/null`, { encoding: 'utf-8' }).trim();
      const gitStatus = execSync(`git -C "${meta.projectPath}" status --porcelain 2>/dev/null`, { encoding: 'utf-8' }).trim();
      const isDirty = gitStatus.length > 0;

      let diffSummary = '';
      if (isDirty) {
        try {
          const diffStat = execSync(`git -C "${meta.projectPath}" diff --stat 2>/dev/null`, { encoding: 'utf-8' }).trim();
          const lines = diffStat.split('\n');
          diffSummary = lines[lines.length - 1] || '';
        } catch {}
      }

      git = {
        branch: gitBranch,
        commit: gitCommit,
        isDirty,
        diffSummary
      };
    } catch {}

    // Get task stats
    const taskStats = this.getTaskStats(sessionName);

    // Build checkpoint object
    const checkpoint = {
      id,
      sessionName,
      name: name || `Checkpoint ${id}`,
      description,
      trigger,
      timestamp,
      git,
      tasks: taskStats,
      scrollback: scrollbackResult ? {
        filename: scrollbackResult.filename,
        timestamp: scrollbackResult.timestamp
      } : null
    };

    // Save checkpoint
    const checkpointPath = path.join(checkpointsDir, `${id}.json`);
    fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2));

    // Log the checkpoint
    this.logCheckpoint(sessionName, name || id);

    return checkpoint;
  }

  listCheckpoints(sessionName) {
    const meta = this.data.sessions[sessionName];
    if (!meta) return [];

    const checkpointsDir = this.getCheckpointsDir(sessionName);
    if (!fs.existsSync(checkpointsDir)) return [];

    try {
      const files = fs.readdirSync(checkpointsDir)
        .filter(f => f.endsWith('.json'))
        .map(f => {
          const filepath = path.join(checkpointsDir, f);
          try {
            const checkpoint = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
            return checkpoint;
          } catch {
            return null;
          }
        })
        .filter(Boolean)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      return files;
    } catch {
      return [];
    }
  }

  getCheckpoint(sessionName, checkpointId) {
    const checkpointsDir = this.getCheckpointsDir(sessionName);
    const checkpointPath = path.join(checkpointsDir, `${checkpointId}.json`);

    if (!fs.existsSync(checkpointPath)) return null;

    try {
      return JSON.parse(fs.readFileSync(checkpointPath, 'utf-8'));
    } catch {
      return null;
    }
  }

  deleteCheckpoint(sessionName, checkpointId) {
    const checkpointsDir = this.getCheckpointsDir(sessionName);
    const checkpointPath = path.join(checkpointsDir, `${checkpointId}.json`);

    if (!fs.existsSync(checkpointPath)) return false;

    try {
      fs.unlinkSync(checkpointPath);
      return true;
    } catch {
      return false;
    }
  }

  restoreCheckpoint(sessionName, checkpointId, options = {}) {
    const meta = this.data.sessions[sessionName];
    if (!meta) throw new Error(`Session "${sessionName}" not found`);

    const checkpoint = this.getCheckpoint(sessionName, checkpointId);
    if (!checkpoint) throw new Error(`Checkpoint "${checkpointId}" not found`);

    const result = {
      checkpoint,
      actions: [],
      warnings: []
    };

    // Restore git state if requested and available
    if (options.restoreGit && checkpoint.git && checkpoint.git.commit) {
      try {
        // Check if working directory is clean
        const currentStatus = execSync(`git -C "${meta.projectPath}" status --porcelain 2>/dev/null`, { encoding: 'utf-8' }).trim();
        if (currentStatus && !options.force) {
          result.warnings.push('Working directory has uncommitted changes. Use force option to proceed.');
        } else {
          // Checkout the commit
          execSync(`git -C "${meta.projectPath}" checkout ${checkpoint.git.commit} 2>/dev/null`);
          result.actions.push(`Checked out commit ${checkpoint.git.commit}`);
        }
      } catch (err) {
        result.warnings.push(`Failed to restore git state: ${err.message}`);
      }
    }

    // Log the restore
    this.appendProgress(sessionName, `Restored checkpoint: "${checkpoint.name}"`, 'checkpoint');

    return result;
  }

  // Compare two checkpoints
  compareCheckpoints(sessionName, fromId, toId) {
    const from = this.getCheckpoint(sessionName, fromId);
    const to = this.getCheckpoint(sessionName, toId);

    if (!from || !to) {
      throw new Error('One or both checkpoints not found');
    }

    const meta = this.data.sessions[sessionName];
    const comparison = {
      from: { id: from.id, name: from.name, timestamp: from.timestamp },
      to: { id: to.id, name: to.name, timestamp: to.timestamp },
      git: null,
      tasks: null
    };

    // Git comparison
    if (from.git && to.git && from.git.commit !== to.git.commit) {
      try {
        const diff = execSync(
          `git -C "${meta.projectPath}" diff --stat ${from.git.commit}..${to.git.commit} 2>/dev/null`,
          { encoding: 'utf-8' }
        ).trim();
        comparison.git = {
          fromCommit: from.git.commit,
          toCommit: to.git.commit,
          diff
        };
      } catch {}
    }

    // Task comparison
    comparison.tasks = {
      from: from.tasks,
      to: to.tasks,
      completedBetween: (to.tasks?.completed || 0) - (from.tasks?.completed || 0)
    };

    return comparison;
  }

  // =========================================
  // Cross-Session Memory Methods
  // =========================================

  loadMemory() {
    if (!fs.existsSync(MEMORY_FILE)) {
      return {
        entries: [],
        patterns: [],
        techPreferences: {},
        commonErrors: [],
        lastUpdated: null
      };
    }

    try {
      return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf-8'));
    } catch {
      return {
        entries: [],
        patterns: [],
        techPreferences: {},
        commonErrors: [],
        lastUpdated: null
      };
    }
  }

  saveMemory(memory) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    memory.lastUpdated = new Date().toISOString();
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2));
  }

  addMemoryEntry(entry) {
    const memory = this.loadMemory();

    const memoryEntry = {
      id: `mem_${Date.now()}`,
      timestamp: new Date().toISOString(),
      type: entry.type || 'learning', // learning, error, preference, pattern
      content: entry.content,
      source: entry.source, // session name or project
      tags: entry.tags || [],
      projectType: entry.projectType || null
    };

    memory.entries.push(memoryEntry);

    // Keep only last 500 entries
    if (memory.entries.length > 500) {
      memory.entries = memory.entries.slice(-500);
    }

    this.saveMemory(memory);
    return memoryEntry;
  }

  getMemory() {
    return this.loadMemory();
  }

  getRelevantMemories(projectType, tags = [], limit = 10) {
    const memory = this.loadMemory();
    let relevant = [];

    // Filter by project type if provided
    if (projectType) {
      relevant = memory.entries.filter(e =>
        e.projectType === projectType ||
        (e.tags && e.tags.some(t => t.toLowerCase().includes(projectType.toLowerCase())))
      );
    }

    // Also include entries matching any of the provided tags
    if (tags.length > 0) {
      const tagMatches = memory.entries.filter(e =>
        e.tags && e.tags.some(t => tags.some(tag =>
          t.toLowerCase().includes(tag.toLowerCase())
        ))
      );
      relevant = [...new Set([...relevant, ...tagMatches])];
    }

    // If no filters match, return most recent entries
    if (relevant.length === 0) {
      relevant = memory.entries;
    }

    // Sort by recency and limit
    return relevant
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  }

  // Extract memories from a session's progress.txt
  extractMemoryFromProgress(sessionName) {
    const progress = this.getProgress(sessionName);
    if (!progress || progress.length === 0) return [];

    const meta = this.data.sessions[sessionName];
    const extracted = [];

    // Patterns to identify valuable learnings
    const patterns = {
      error: /(?:error|failed|exception|bug|fix(?:ed)?)/i,
      preference: /(?:prefer|chose|decided|using|switched to)/i,
      learning: /(?:learned|discovered|found|realized|important|note)/i,
      pattern: /(?:pattern|approach|architecture|structure|design)/i
    };

    for (const entry of progress) {
      const content = entry.content.toLowerCase();
      let type = 'learning';
      const tags = [];

      // Determine entry type
      for (const [patternType, regex] of Object.entries(patterns)) {
        if (regex.test(content)) {
          type = patternType;
          break;
        }
      }

      // Extract potential tags from content
      const techKeywords = [
        'react', 'vue', 'angular', 'node', 'express', 'python', 'django',
        'flask', 'rust', 'go', 'typescript', 'javascript', 'api', 'database',
        'postgresql', 'mysql', 'mongodb', 'redis', 'docker', 'kubernetes',
        'aws', 'gcp', 'azure', 'auth', 'jwt', 'oauth', 'rest', 'graphql'
      ];

      for (const keyword of techKeywords) {
        if (content.includes(keyword)) {
          tags.push(keyword);
        }
      }

      // Only extract substantial entries (more than just a few words)
      if (entry.content.length > 30 && (type !== 'learning' || tags.length > 0)) {
        extracted.push({
          type,
          content: entry.content.substring(0, 500),
          source: sessionName,
          tags,
          projectType: meta?.projectPath ? this.inferProjectType(meta.projectPath) : null
        });
      }
    }

    return extracted;
  }

  // Infer project type from path or file structure
  inferProjectType(projectPath) {
    try {
      const files = fs.readdirSync(projectPath);

      if (files.includes('package.json')) {
        const pkg = JSON.parse(fs.readFileSync(path.join(projectPath, 'package.json'), 'utf-8'));
        if (pkg.dependencies?.react || pkg.devDependencies?.react) return 'react';
        if (pkg.dependencies?.vue || pkg.devDependencies?.vue) return 'vue';
        if (pkg.dependencies?.express) return 'express';
        if (pkg.dependencies?.next) return 'nextjs';
        return 'nodejs';
      }

      if (files.includes('requirements.txt') || files.includes('setup.py')) {
        return 'python';
      }

      if (files.includes('Cargo.toml')) return 'rust';
      if (files.includes('go.mod')) return 'go';
      if (files.includes('Gemfile')) return 'ruby';

      return 'unknown';
    } catch {
      return 'unknown';
    }
  }

  // Aggregate memories from all sessions
  aggregateMemories() {
    const memory = this.loadMemory();
    const sessions = Object.keys(this.data.sessions);

    let newEntriesCount = 0;

    for (const sessionName of sessions) {
      const extracted = this.extractMemoryFromProgress(sessionName);

      for (const entry of extracted) {
        // Check for duplicates (similar content from same source)
        const isDuplicate = memory.entries.some(e =>
          e.source === entry.source &&
          e.content.substring(0, 100) === entry.content.substring(0, 100)
        );

        if (!isDuplicate) {
          this.addMemoryEntry(entry);
          newEntriesCount++;
        }
      }
    }

    // Update patterns and preferences
    this.updateMemoryPatterns();

    return { newEntriesCount, totalEntries: this.loadMemory().entries.length };
  }

  // Analyze entries to find patterns and preferences
  updateMemoryPatterns() {
    const memory = this.loadMemory();

    // Count tag frequencies
    const tagCounts = {};
    for (const entry of memory.entries) {
      for (const tag of (entry.tags || [])) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }

    // Find common errors (entries of type 'error')
    const errors = memory.entries
      .filter(e => e.type === 'error')
      .map(e => e.content.substring(0, 200));

    // Group similar errors
    const errorGroups = {};
    for (const error of errors) {
      const key = error.substring(0, 50);
      errorGroups[key] = (errorGroups[key] || 0) + 1;
    }

    memory.commonErrors = Object.entries(errorGroups)
      .filter(([_, count]) => count >= 2)
      .map(([error, count]) => ({ error, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    // Find tech preferences (most used technologies)
    const sortedTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);

    memory.techPreferences = Object.fromEntries(sortedTags);

    // Find patterns (entries of type 'pattern')
    memory.patterns = memory.entries
      .filter(e => e.type === 'pattern')
      .slice(-20)
      .map(e => ({
        content: e.content.substring(0, 200),
        tags: e.tags,
        projectType: e.projectType
      }));

    this.saveMemory(memory);
  }

  // Clear memory (for testing or reset)
  clearMemory() {
    const emptyMemory = {
      entries: [],
      patterns: [],
      techPreferences: {},
      commonErrors: [],
      lastUpdated: new Date().toISOString()
    };
    this.saveMemory(emptyMemory);
    return emptyMemory;
  }
}

module.exports = SessionManager;
