/**
 * Ralph Loop Execution Engine
 *
 * Manages autonomous AI coding loops:
 * - LLM-powered active monitoring (primary when configured)
 * - Status file fallback (when no LLM)
 * - Smart stuck detection with auto-verification
 * - Circuit breaker for safety
 */

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

class RalphLoop extends EventEmitter {
  constructor(sessionManager) {
    super();
    this.sessionManager = sessionManager;
    this.activeLoops = new Map(); // sessionName -> loopState
    this.watchers = new Map(); // sessionName -> watcher state
    this.botConfig = null;

    // Monitoring settings
    this.monitorSettings = {
      checkInterval: 10,        // seconds - base check interval
      activeInterval: 5,        // seconds - interval when activity detected
      idleInterval: 30,         // seconds - interval when idle
      terminalLines: 20,        // lines to send to LLM
      stuckThreshold: 3,        // checks with no progress before stuck
      autoVerifyStuck: true,    // automatically verify stuck tasks with LLM
      activityTimeout: 120      // seconds - no activity = potentially stuck
    };
  }

  // Set bot config reference
  setConfig(botConfig) {
    this.botConfig = botConfig;
  }

  // Check if LLM is configured
  isLLMConfigured() {
    if (!this.botConfig) return false;
    const provider = this.botConfig.get('provider.name');
    const apiKey = this.botConfig.get('provider.apiKey');
    const baseUrl = this.botConfig.get('provider.baseUrl');
    return !!(provider && apiKey && baseUrl);
  }

  // Get LLM config
  getLLMConfig() {
    if (!this.botConfig) return null;
    return {
      provider: this.botConfig.get('provider.name'),
      baseUrl: this.botConfig.get('provider.baseUrl'),
      apiKey: this.botConfig.get('provider.apiKey'),
      model: this.botConfig.get('provider.model') || 'gpt-4o-mini'
    };
  }

  // ============================================
  // ACTIVE MONITORING SERVICE
  // ============================================

  /**
   * Start active monitoring for a session
   * Uses LLM when configured, falls back to status file
   */
  startMonitoring(sessionName) {
    this.stopMonitoring(sessionName);

    const watcherState = {
      sessionName,
      lastTerminalContent: '',
      lastStatusFile: null,
      lastActivityAt: Date.now(),
      checkCount: 0,
      noProgressCount: 0,
      currentInterval: this.monitorSettings.checkInterval * 1000
    };

    this.watchers.set(sessionName, watcherState);

    console.log(`[Ralph] Starting active monitoring for ${sessionName}`);
    console.log(`[Ralph] LLM monitoring: ${this.isLLMConfigured() ? 'ENABLED' : 'DISABLED (using status file only)'}`);

    // Start the monitoring loop
    this.scheduleNextCheck(sessionName);
  }

  /**
   * Stop monitoring for a session
   */
  stopMonitoring(sessionName) {
    const watcher = this.watchers.get(sessionName);
    if (watcher) {
      if (watcher.timer) {
        clearTimeout(watcher.timer);
      }
      this.watchers.delete(sessionName);
      console.log(`[Ralph] Stopped monitoring for ${sessionName}`);
    }
  }

  /**
   * Schedule next check with adaptive interval
   */
  scheduleNextCheck(sessionName) {
    const watcher = this.watchers.get(sessionName);
    if (!watcher) return;

    const state = this.getLoopState(sessionName);
    if (!state || state.status !== 'running') {
      this.stopMonitoring(sessionName);
      return;
    }

    watcher.timer = setTimeout(async () => {
      await this.performCheck(sessionName);
      this.scheduleNextCheck(sessionName);
    }, watcher.currentInterval);
  }

  /**
   * Main check function - uses LLM or status file
   */
  async performCheck(sessionName) {
    const watcher = this.watchers.get(sessionName);
    const state = this.getLoopState(sessionName);
    if (!watcher || !state || state.status !== 'running') return;

    watcher.checkCount++;
    const currentTask = this.sessionManager.getCurrentTask(sessionName);
    if (!currentTask) {
      // No more tasks
      this.handleAllTasksComplete(sessionName);
      return;
    }

    // Get current terminal content and status file
    const terminalContent = this.getTerminalContent(sessionName);
    const statusFile = this.getStatusFileContent(sessionName);

    // Check for activity
    const hasActivity = terminalContent !== watcher.lastTerminalContent ||
                        JSON.stringify(statusFile) !== JSON.stringify(watcher.lastStatusFile);

    if (hasActivity) {
      watcher.lastActivityAt = Date.now();
      watcher.lastTerminalContent = terminalContent;
      watcher.lastStatusFile = statusFile;
      // Use faster interval when active
      watcher.currentInterval = this.monitorSettings.activeInterval * 1000;
    } else {
      // Slow down checks when idle
      const idleTime = (Date.now() - watcher.lastActivityAt) / 1000;
      if (idleTime > 60) {
        watcher.currentInterval = this.monitorSettings.idleInterval * 1000;
      }
    }

    // Perform the actual check
    if (this.isLLMConfigured()) {
      await this.checkWithLLM(sessionName, currentTask, terminalContent, statusFile, watcher);
    } else {
      await this.checkWithStatusFile(sessionName, currentTask, statusFile, watcher);
    }
  }

  /**
   * Get last N lines of terminal content
   */
  getTerminalContent(sessionName) {
    try {
      const content = this.sessionManager.getScrollbackContent(sessionName, 'latest');
      if (!content) return '';
      const lines = content.split('\n');
      return lines.slice(-this.monitorSettings.terminalLines).join('\n');
    } catch (err) {
      return '';
    }
  }

  /**
   * Get status file content
   */
  getStatusFileContent(sessionName) {
    try {
      const session = this.sessionManager.get(sessionName);
      if (!session) return null;

      const statusPath = path.join(session.projectPath, '.ralph', 'status.json');
      if (!fs.existsSync(statusPath)) return null;

      const content = fs.readFileSync(statusPath, 'utf-8');
      return JSON.parse(content);
    } catch (err) {
      return null;
    }
  }

  // ============================================
  // LLM-BASED CHECKING (PRIMARY)
  // ============================================

  /**
   * Check task status using LLM analysis
   */
  async checkWithLLM(sessionName, task, terminal, statusFile, watcher) {
    const state = this.getLoopState(sessionName);

    // Build context for LLM
    const prompt = this.buildLLMPrompt(task, terminal, statusFile, watcher);

    try {
      const analysis = await this.callLLMForAnalysis(prompt);

      if (!analysis) {
        console.log(`[Ralph] LLM returned no analysis for ${sessionName}`);
        return;
      }

      console.log(`[Ralph] LLM analysis for ${sessionName}: ${analysis.status} (${Math.round(analysis.confidence * 100)}%) - ${analysis.reason}`);

      // Handle based on status
      switch (analysis.status) {
        case 'completed':
          if (analysis.confidence >= 0.7) {
            await this.handleTaskComplete(sessionName, task, analysis);
          }
          break;

        case 'in_progress':
          // Reset no-progress counter if actually making progress
          if (analysis.hasProgress) {
            watcher.noProgressCount = 0;
          }
          break;

        case 'stuck':
        case 'error':
        case 'blocked':
          watcher.noProgressCount++;
          if (watcher.noProgressCount >= this.monitorSettings.stuckThreshold) {
            await this.handleTaskStuck(sessionName, task, analysis);
          }
          break;

        case 'waiting_input':
          // Task is waiting for user input
          this.emit('waiting_input', { sessionName, task, reason: analysis.reason });
          break;
      }

      // Update state
      state.lastAnalysis = analysis;
      state.lastAnalysisAt = new Date().toISOString();

    } catch (err) {
      console.error(`[Ralph] LLM check error for ${sessionName}: ${err.message}`);
    }
  }

  /**
   * Build prompt for LLM analysis
   */
  buildLLMPrompt(task, terminal, statusFile, watcher) {
    let prompt = `You are monitoring an AI coding session. Analyze the current state and determine the task status.

## Task
Title: ${task.title}
${task.description ? `Description: ${task.description}` : ''}

## Terminal Output (last ${this.monitorSettings.terminalLines} lines)
\`\`\`
${terminal || '(no output)'}
\`\`\`

## Status File (.ralph/status.json)
\`\`\`json
${statusFile ? JSON.stringify(statusFile, null, 2) : '(not found)'}
\`\`\`

## Monitoring Info
- Check #${watcher.checkCount}
- Time since last activity: ${Math.round((Date.now() - watcher.lastActivityAt) / 1000)}s
- No-progress count: ${watcher.noProgressCount}

## Instructions
Analyze the terminal output and status file to determine:
1. Is the task COMPLETED? (look for: git commits, "DONE", test passes, status file says completed)
2. Is it IN_PROGRESS? (active work happening, commands running)
3. Is it STUCK? (errors, no progress, repeated failures)
4. Is it WAITING_INPUT? (prompts, questions, permission requests)

Reply with JSON only:
{
  "status": "completed" | "in_progress" | "stuck" | "error" | "blocked" | "waiting_input",
  "confidence": 0.0-1.0,
  "reason": "brief explanation",
  "hasProgress": true/false,
  "suggestedAction": "optional suggestion if stuck"
}`;

    return prompt;
  }

  /**
   * Call LLM for analysis
   */
  async callLLMForAnalysis(prompt) {
    const config = this.getLLMConfig();
    if (!config) return null;

    try {
      const response = await this.callLLM(config, prompt);
      if (!response) return null;

      // Clean and parse response
      let cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (err) {
      console.error(`[Ralph] Failed to parse LLM response: ${err.message}`);
    }

    return null;
  }

  /**
   * Make HTTP request to LLM
   */
  callLLM(config, prompt) {
    return new Promise((resolve, reject) => {
      const url = new URL(config.baseUrl + '/chat/completions');
      const protocol = url.protocol === 'https:' ? https : http;

      const body = JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 300,
        temperature: 0.1
      });

      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + config.apiKey,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        },
        timeout: 30000
      };

      const request = protocol.request(options, (response) => {
        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.choices && json.choices[0] && json.choices[0].message) {
              let content = json.choices[0].message.content;
              // Handle reasoning models
              if (!content && json.choices[0].message.reasoning_content) {
                const reasoning = json.choices[0].message.reasoning_content;
                const jsonMatch = reasoning.match(/\{[\s\S]*?"status"[\s\S]*?\}/);
                if (jsonMatch) content = jsonMatch[0];
              }
              resolve(content || null);
            } else if (json.error) {
              reject(new Error(json.error.message || 'API error'));
            } else {
              resolve(null);
            }
          } catch (e) {
            reject(new Error('Failed to parse LLM response'));
          }
        });
      });

      request.on('error', reject);
      request.on('timeout', () => {
        request.destroy();
        reject(new Error('Request timed out'));
      });

      request.write(body);
      request.end();
    });
  }

  // ============================================
  // STATUS FILE CHECKING (FALLBACK)
  // ============================================

  /**
   * Check using only status file (when no LLM)
   */
  async checkWithStatusFile(sessionName, task, statusFile, watcher) {
    if (!statusFile) {
      // No status file yet, check for activity timeout
      const idleTime = (Date.now() - watcher.lastActivityAt) / 1000;
      if (idleTime > this.monitorSettings.activityTimeout) {
        watcher.noProgressCount++;
        if (watcher.noProgressCount >= this.monitorSettings.stuckThreshold) {
          await this.handleTaskStuck(sessionName, task, {
            status: 'stuck',
            reason: 'No activity detected',
            confidence: 0.6
          });
        }
      }
      return;
    }

    // Check status file content
    switch (statusFile.status) {
      case 'completed':
        await this.handleTaskComplete(sessionName, task, {
          status: 'completed',
          reason: statusFile.result?.message || 'Status file marked complete',
          confidence: 1.0
        });
        break;

      case 'error':
      case 'blocked':
        watcher.noProgressCount++;
        if (watcher.noProgressCount >= this.monitorSettings.stuckThreshold) {
          await this.handleTaskStuck(sessionName, task, {
            status: statusFile.status,
            reason: statusFile.error || 'Task blocked/errored',
            confidence: 1.0
          });
        }
        break;

      case 'in_progress':
        // Check if progress is being made
        if (statusFile.progress !== watcher.lastProgress) {
          watcher.lastProgress = statusFile.progress;
          watcher.noProgressCount = 0;
          watcher.lastActivityAt = Date.now();
        }
        break;
    }
  }

  // ============================================
  // STUCK DETECTION & AUTO-VERIFICATION
  // ============================================

  /**
   * Handle stuck task - optionally verify with LLM
   */
  async handleTaskStuck(sessionName, task, analysis) {
    const state = this.getLoopState(sessionName);
    if (!state) return;

    console.log(`[Ralph] Task potentially stuck: ${task.title} - ${analysis.reason}`);

    // If LLM is configured and auto-verify is enabled, do a deeper check
    if (this.isLLMConfigured() && this.monitorSettings.autoVerifyStuck) {
      console.log(`[Ralph] Running LLM verification for stuck task...`);

      const verificationResult = await this.verifyStuckWithLLM(sessionName, task);

      if (verificationResult) {
        if (verificationResult.actuallyComplete) {
          console.log(`[Ralph] LLM verification: Task is actually COMPLETE`);
          await this.handleTaskComplete(sessionName, task, {
            status: 'completed',
            reason: verificationResult.reason,
            confidence: verificationResult.confidence
          });
          return;
        } else if (verificationResult.stillWorking) {
          console.log(`[Ralph] LLM verification: Task is still being worked on`);
          // Reset counters and continue
          const watcher = this.watchers.get(sessionName);
          if (watcher) {
            watcher.noProgressCount = 0;
            watcher.lastActivityAt = Date.now();
          }
          return;
        }
      }
    }

    // Mark as stuck
    state.status = 'stuck';
    state.stuckAt = new Date().toISOString();
    state.stuckReason = analysis.reason;
    state.circuitBreaker.noProgressCount = this.monitorSettings.stuckThreshold;

    this.updateSessionMeta(sessionName, state);
    this.stopMonitoring(sessionName);

    this.emit('stuck', {
      sessionName,
      state,
      task,
      reason: analysis.reason,
      suggestedAction: analysis.suggestedAction
    });
  }

  /**
   * Verify if a task is really stuck using deeper LLM analysis
   */
  async verifyStuckWithLLM(sessionName, task) {
    const terminal = this.sessionManager.getScrollbackContent(sessionName, 'latest');
    const lines = terminal ? terminal.split('\n').slice(-50).join('\n') : ''; // More context for verification
    const statusFile = this.getStatusFileContent(sessionName);

    const prompt = `You are verifying if a coding task is stuck or actually complete.

## Task: ${task.title}
${task.description ? `Description: ${task.description}` : ''}

## Recent Terminal Output (last 50 lines)
\`\`\`
${lines || '(no output)'}
\`\`\`

## Status File
\`\`\`json
${statusFile ? JSON.stringify(statusFile, null, 2) : '(not found)'}
\`\`\`

## Context
The monitoring system flagged this task as potentially stuck. Please verify:

1. Is the task actually COMPLETE? (commits made, tests passing, done signal)
2. Is it still being WORKED ON? (just slow, long-running process)
3. Is it truly STUCK? (errors, loops, no progress)

Reply with JSON:
{
  "actuallyComplete": true/false,
  "stillWorking": true/false,
  "confidence": 0.0-1.0,
  "reason": "explanation"
}`;

    try {
      const response = await this.callLLMForAnalysis(prompt);
      return response;
    } catch (err) {
      console.error(`[Ralph] Stuck verification failed: ${err.message}`);
      return null;
    }
  }

  // ============================================
  // COMPLETION HANDLERS
  // ============================================

  /**
   * Handle task completion
   */
  async handleTaskComplete(sessionName, task, analysis) {
    const state = this.getLoopState(sessionName);
    if (!state) return;

    console.log(`[Ralph] Task completed: ${task.title}`);

    // Mark task complete
    this.sessionManager.markTaskComplete(sessionName, task.id);
    this.sessionManager.logTaskComplete(sessionName, task.title);

    // Write/update status file
    this.writeStatusFile(sessionName, task, analysis);

    // Reset circuit breaker
    state.circuitBreaker.noProgressCount = 0;
    state.circuitBreaker.errorCount = 0;

    // Reset watcher
    const watcher = this.watchers.get(sessionName);
    if (watcher) {
      watcher.noProgressCount = 0;
      watcher.lastActivityAt = Date.now();
    }

    this.emit('taskComplete', { sessionName, state, task, analysis });

    // Clear status file for next task
    this.sessionManager.clearStatusFile(sessionName);

    // Check for next task
    const nextTask = this.sessionManager.getCurrentTask(sessionName);
    if (!nextTask) {
      this.handleAllTasksComplete(sessionName);
    } else {
      // Continue to next task
      console.log(`[Ralph] Starting next task: ${nextTask.title}`);
      state.iterationCount++;
      this.sessionManager.logIteration(sessionName, state.iterationCount);
      await this.runIteration(sessionName);
    }
  }

  /**
   * Handle all tasks complete
   */
  handleAllTasksComplete(sessionName) {
    const state = this.getLoopState(sessionName);
    if (!state) return;

    console.log(`[Ralph] All tasks completed for ${sessionName}`);

    state.status = 'complete';
    state.completedAt = new Date().toISOString();

    this.updateSessionMeta(sessionName, state);
    this.stopMonitoring(sessionName);

    this.emit('complete', { sessionName, state });
  }

  /**
   * Write status file
   */
  writeStatusFile(sessionName, task, analysis) {
    try {
      const session = this.sessionManager.get(sessionName);
      if (!session) return;

      const statusDir = path.join(session.projectPath, '.ralph');
      const statusPath = path.join(statusDir, 'status.json');

      if (!fs.existsSync(statusDir)) {
        fs.mkdirSync(statusDir, { recursive: true });
      }

      const status = {
        version: '1.0',
        status: 'completed',
        task: task.id,
        progress: 100,
        currentStep: 'Completed',
        timestamp: new Date().toISOString(),
        result: {
          success: true,
          message: analysis.reason,
          detectedBy: this.isLLMConfigured() ? 'llm' : 'status_file',
          confidence: analysis.confidence
        }
      };

      fs.writeFileSync(statusPath, JSON.stringify(status, null, 2));
    } catch (err) {
      console.error(`[Ralph] Failed to write status file: ${err.message}`);
    }
  }

  // ============================================
  // LOOP MANAGEMENT
  // ============================================

  /**
   * Get loop state
   */
  getLoopState(sessionName) {
    return this.activeLoops.get(sessionName) || null;
  }

  /**
   * Initialize loop state
   */
  initLoopState(sessionName, config = {}) {
    const state = {
      sessionName,
      status: 'idle',
      iterationCount: 0,
      maxIterations: config.maxIterations || 50,
      currentTaskId: null,
      lastAnalysis: null,
      lastAnalysisAt: null,
      circuitBreaker: {
        noProgressCount: 0,
        errorCount: 0,
        threshold: config.circuitBreakerThreshold || 3
      },
      startedAt: null,
      pausedAt: null,
      completedAt: null,
      stuckAt: null,
      stuckReason: null
    };

    this.activeLoops.set(sessionName, state);
    return state;
  }

  /**
   * Start the loop
   */
  async startLoop(sessionName) {
    const meta = this.sessionManager.get(sessionName);
    if (!meta) throw new Error(`Session "${sessionName}" not found`);

    let state = this.getLoopState(sessionName);
    if (!state) {
      state = this.initLoopState(sessionName);
    }

    if (state.status === 'running') {
      throw new Error('Loop is already running');
    }

    // Clear stale status file
    this.sessionManager.clearStatusFile(sessionName);

    // Check for tasks
    const currentTask = this.sessionManager.getCurrentTask(sessionName);
    if (!currentTask) {
      state.status = 'complete';
      state.completedAt = new Date().toISOString();
      this.emit('complete', { sessionName, state });
      return state;
    }

    state.status = 'running';
    state.startedAt = new Date().toISOString();
    state.pausedAt = null;
    state.stuckAt = null;
    state.stuckReason = null;

    this.updateSessionMeta(sessionName, state);
    this.emit('started', { sessionName, state });

    // Start monitoring
    this.startMonitoring(sessionName);

    // Run first iteration
    await this.runIteration(sessionName);

    return state;
  }

  /**
   * Pause the loop
   */
  pauseLoop(sessionName) {
    const state = this.getLoopState(sessionName);
    if (!state) throw new Error('No loop state found');
    if (state.status !== 'running') throw new Error('Loop is not running');

    this.stopMonitoring(sessionName);

    state.status = 'paused';
    state.pausedAt = new Date().toISOString();

    this.updateSessionMeta(sessionName, state);
    this.emit('paused', { sessionName, state });

    return state;
  }

  /**
   * Resume the loop
   */
  async resumeLoop(sessionName) {
    const state = this.getLoopState(sessionName);
    if (!state) throw new Error('No loop state found');
    if (state.status !== 'paused' && state.status !== 'stuck') {
      throw new Error('Loop is not paused or stuck');
    }

    // Clear status file
    this.sessionManager.clearStatusFile(sessionName);

    // Reset if coming from stuck
    if (state.status === 'stuck') {
      state.circuitBreaker.noProgressCount = 0;
      state.circuitBreaker.errorCount = 0;
      state.stuckAt = null;
      state.stuckReason = null;
    }

    state.status = 'running';
    state.pausedAt = null;

    this.updateSessionMeta(sessionName, state);
    this.emit('resumed', { sessionName, state });

    // Restart monitoring
    this.startMonitoring(sessionName);

    // Continue
    await this.runIteration(sessionName);

    return state;
  }

  /**
   * Stop the loop
   */
  stopLoop(sessionName) {
    const state = this.getLoopState(sessionName);
    if (!state) return null;

    this.stopMonitoring(sessionName);

    state.status = 'idle';
    state.pausedAt = new Date().toISOString();

    this.updateSessionMeta(sessionName, state);
    this.emit('stopped', { sessionName, state });

    return state;
  }

  /**
   * Run a single iteration
   */
  async runIteration(sessionName) {
    const state = this.getLoopState(sessionName);
    if (!state || state.status !== 'running') return;

    state.iterationCount++;
    state.lastIterationAt = new Date().toISOString();

    const currentTask = this.sessionManager.getCurrentTask(sessionName);
    if (!currentTask) {
      this.handleAllTasksComplete(sessionName);
      return;
    }

    state.currentTaskId = currentTask.id;
    this.sessionManager.logTaskStart(sessionName, currentTask.title);
    this.sessionManager.logIteration(sessionName, state.iterationCount);

    // Build and send prompt
    const prompt = this.buildPrompt(sessionName);

    try {
      await this.restartSessionWithPrompt(sessionName, prompt);
    } catch (err) {
      this.sessionManager.logError(sessionName, `Failed to restart session: ${err.message}`);
      state.circuitBreaker.errorCount++;
      if (state.circuitBreaker.errorCount >= state.circuitBreaker.threshold) {
        await this.handleTaskStuck(sessionName, currentTask, {
          status: 'error',
          reason: `Session restart failed: ${err.message}`,
          confidence: 1.0
        });
      }
      return;
    }

    this.updateSessionMeta(sessionName, state);
    this.emit('iteration', { sessionName, state, task: currentTask });
  }

  /**
   * Build prompt for task
   */
  buildPrompt(sessionName) {
    const currentTask = this.sessionManager.getCurrentTask(sessionName);
    if (!currentTask) return null;

    const progress = this.sessionManager.getProgressRaw(sessionName);
    const taskStats = this.sessionManager.getTaskStats(sessionName);
    const prd = this.sessionManager.loadPrd(sessionName);

    let prompt = '';

    if (prd) {
      prompt += `# Project: ${prd.name}\n`;
      if (prd.description) prompt += `${prd.description}\n`;
      prompt += '\n';
    }

    prompt += `## Task Progress: ${taskStats.completed}/${taskStats.total} complete\n\n`;
    prompt += `## Current Task: ${currentTask.title}\n`;
    if (currentTask.description) prompt += `${currentTask.description}\n`;
    prompt += '\n';

    if (currentTask.attempts > 0) {
      prompt += `Note: This is attempt #${currentTask.attempts + 1} for this task.\n\n`;
    }

    if (progress) {
      const recentProgress = progress.split('\n').slice(-20).join('\n');
      if (recentProgress.trim()) {
        prompt += `## Previous Learnings:\n${recentProgress}\n\n`;
      }
    }

    // Simplified instructions
    prompt += `## Task Completion\n`;
    prompt += `When you complete this task:\n`;
    prompt += `1. Run tests to verify your changes work\n`;
    prompt += `2. Commit your changes with a descriptive message\n`;
    prompt += `3. Write completion status to \`.ralph/status.json\`:\n`;
    prompt += `\`\`\`json\n`;
    prompt += `{\n`;
    prompt += `  "status": "completed",\n`;
    prompt += `  "task": "${currentTask.id}",\n`;
    prompt += `  "progress": 100,\n`;
    prompt += `  "result": { "success": true, "message": "What you accomplished" }\n`;
    prompt += `}\n`;
    prompt += `\`\`\`\n`;
    prompt += `4. End your response with DONE\n\n`;

    prompt += `If you encounter errors, update status.json with status: "error" and describe the issue.\n`;

    return prompt;
  }

  /**
   * Restart session with prompt
   * Note: Uses execSync for tmux commands - these are hardcoded system commands, not user input
   */
  async restartSessionWithPrompt(sessionName, prompt) {
    const meta = this.sessionManager.get(sessionName);
    if (!meta) throw new Error('Session not found');

    const { execSync } = require('child_process');
    const TMUX_BIN = '/usr/bin/tmux';

    console.log(`[Ralph] Restarting session for next task`);

    // Capture scrollback before stopping
    this.sessionManager.captureScrollback(sessionName);

    // Stop and restart for fresh context
    if (meta.alive) {
      this.sessionManager.stop(sessionName);
      await this.sleep(2000);
    }

    // Update prompt and revive
    const sessionData = this.sessionManager.data.sessions[sessionName];
    if (sessionData) {
      sessionData.initialPrompt = prompt;
      this.sessionManager.save();
    }

    this.sessionManager.revive(sessionName);
    await this.sleep(3000);

    // Send prompt via tmux (hardcoded commands, safe)
    const tmpFile = path.join('/tmp', `ralph-prompt-${Date.now()}.txt`);
    try {
      fs.writeFileSync(tmpFile, prompt);
      execSync(`${TMUX_BIN} load-buffer "${tmpFile}"`, { timeout: 2000 });
      execSync(`${TMUX_BIN} paste-buffer -t "${meta.tmuxSession}"`, { timeout: 2000 });
      execSync(`${TMUX_BIN} send-keys -t "${meta.tmuxSession}" Enter`, { timeout: 2000 });
      fs.unlinkSync(tmpFile);
      console.log(`[Ralph] Prompt sent successfully`);
      await this.sleep(2000);
    } catch (err) {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
      throw err;
    }
  }

  /**
   * Update session metadata
   */
  updateSessionMeta(sessionName, state) {
    const sessionData = this.sessionManager.data.sessions[sessionName];
    if (!sessionData) return;

    sessionData.mode = 'ralph';
    sessionData.loopConfig = {
      maxIterations: state.maxIterations,
      iterationCount: state.iterationCount,
      status: state.status,
      circuitBreaker: { ...state.circuitBreaker },
      lastAnalysis: state.lastAnalysis
    };

    const taskStats = this.sessionManager.getTaskStats(sessionName);
    sessionData.tasks = taskStats;

    this.sessionManager.save();
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get all loop statuses
   */
  getAllLoopStatus() {
    const result = {};
    for (const [sessionName, state] of this.activeLoops) {
      const watcher = this.watchers.get(sessionName);
      result[sessionName] = {
        status: state.status,
        iterationCount: state.iterationCount,
        maxIterations: state.maxIterations,
        currentTaskId: state.currentTaskId,
        circuitBreaker: state.circuitBreaker,
        lastAnalysis: state.lastAnalysis,
        monitoring: watcher ? {
          checkCount: watcher.checkCount,
          noProgressCount: watcher.noProgressCount,
          lastActivityAgo: Math.round((Date.now() - watcher.lastActivityAt) / 1000)
        } : null
      };
    }
    return result;
  }

  /**
   * Update monitoring settings
   */
  updateMonitorSettings(settings) {
    this.monitorSettings = { ...this.monitorSettings, ...settings };
    console.log('[Ralph] Monitor settings updated:', this.monitorSettings);
  }

  // Legacy compatibility
  startLogDetection(sessionName) { this.startMonitoring(sessionName); }
  stopLogDetection(sessionName) { this.stopMonitoring(sessionName); }
  updateDetectionSettings(settings) { this.updateMonitorSettings(settings); }
  isProviderConfigured() { return this.isLLMConfigured(); }
  getProviderConfig() { return this.getLLMConfig(); }
}

module.exports = RalphLoop;
