/**
 * Ralph Loop Execution Engine
 *
 * Manages autonomous AI coding loops:
 * - Iterates through tasks until complete
 * - Fresh context each iteration
 * - Tracks progress and detects completion
 * - Circuit breaker for safety
 */

const EventEmitter = require('events');

class RalphLoop extends EventEmitter {
  constructor(sessionManager) {
    super();
    this.sessionManager = sessionManager;
    this.activeLoops = new Map(); // sessionName -> loopState
  }

  // Get loop state for a session
  getLoopState(sessionName) {
    return this.activeLoops.get(sessionName) || null;
  }

  // Initialize loop state for a session
  initLoopState(sessionName, config = {}) {
    const state = {
      sessionName,
      status: 'idle', // idle, running, paused, complete, stuck
      iterationCount: 0,
      maxIterations: config.maxIterations || 50,
      currentTaskId: null,
      lastExitSignal: null,
      circuitBreaker: {
        noProgressCount: 0,
        errorCount: 0,
        threshold: config.circuitBreakerThreshold || 3
      },
      startedAt: null,
      pausedAt: null,
      completedAt: null,
      lastIterationAt: null
    };

    this.activeLoops.set(sessionName, state);
    return state;
  }

  // Build prompt for current task including progress context
  buildPrompt(sessionName) {
    const currentTask = this.sessionManager.getCurrentTask(sessionName);
    if (!currentTask) return null;

    const progress = this.sessionManager.getProgressRaw(sessionName);
    const taskStats = this.sessionManager.getTaskStats(sessionName);
    const prd = this.sessionManager.loadPrd(sessionName);

    let prompt = '';

    // Add project context
    if (prd) {
      prompt += `# Project: ${prd.name}\n`;
      if (prd.description) {
        prompt += `${prd.description}\n`;
      }
      prompt += '\n';
    }

    // Add task status overview
    prompt += `## Task Progress: ${taskStats.completed}/${taskStats.total} complete\n\n`;

    // Add current task
    prompt += `## Current Task: ${currentTask.title}\n`;
    if (currentTask.description) {
      prompt += `${currentTask.description}\n`;
    }
    prompt += '\n';

    // Add attempt info if retrying
    if (currentTask.attempts > 0) {
      prompt += `Note: This is attempt #${currentTask.attempts + 1} for this task.\n\n`;
    }

    // Add relevant progress/learnings from previous iterations
    if (progress) {
      const recentProgress = progress.split('\n').slice(-20).join('\n');
      if (recentProgress.trim()) {
        prompt += `## Previous Learnings:\n${recentProgress}\n\n`;
      }
    }

    // Add task tracking system instructions
    prompt += `## Task Tracking System:\n`;
    prompt += `This system uses THREE detection methods for 100% reliable completion tracking:\n\n`;

    prompt += `### PRIMARY METHOD: Status File (Most Reliable)\n`;
    prompt += `Write progress updates to \`.ralph/status.json\` in the project root.\n`;
    prompt += `IMPORTANT: Valid status values are ONLY: "in_progress", "completed", "error", "blocked"\n\n`;
    prompt += `**When starting:**\n`;
    prompt += `\`\`\`json\n`;
    prompt += `{\n`;
    prompt += `  "version": "1.0",\n`;
    prompt += `  "status": "in_progress",\n`;
    prompt += `  "task": "${currentTask.id}",\n`;
    prompt += `  "progress": 25,\n`;
    prompt += `  "currentStep": "Analyzing requirements",\n`;
    prompt += `  "timestamp": "${new Date().toISOString()}"\n`;
    prompt += `}\n`;
    prompt += `\`\`\`\n\n`;

    prompt += `**When complete (REQUIRED - use EXACTLY "completed" for status):**\n`;
    prompt += `\`\`\`json\n`;
    prompt += `{\n`;
    prompt += `  "version": "1.0",\n`;
    prompt += `  "status": "completed",  // CRITICAL: Must be exactly "completed" (not "complete")\n`;
    prompt += `  "task": "${currentTask.id}",\n`;
    prompt += `  "progress": 100,\n`;
    prompt += `  "currentStep": "Verified and committed",\n`;
    prompt += `  "timestamp": "${new Date().toISOString()}",\n`;
    prompt += `  "result": {\n`;
    prompt += `    "success": true,\n`;
    prompt += `    "message": "Task completed successfully",\n`;
    prompt += `    "gitCommit": "abc123",\n`;
    prompt += `    "testsRun": true,\n`;
    prompt += `    "testResults": {"total": 10, "passed": 10, "failed": 0},\n`;
    prompt += `    "artifacts": [\n`;
    prompt += `      {"type": "file", "path": "src/foo.js", "description": "New module"}\n`;
    prompt += `    ]\n`;
    prompt += `  }\n`;
    prompt += `}\n`;
    prompt += `\`\`\`\n\n`;

    prompt += `**On error:**\n`;
    prompt += `\`\`\`json\n`;
    prompt += `{\n`;
    prompt += `  "version": "1.0",\n`;
    prompt += `  "status": "error",\n`;
    prompt += `  "task": "${currentTask.id}",\n`;
    prompt += `  "progress": 50,\n`;
    prompt += `  "timestamp": "${new Date().toISOString()}",\n`;
    prompt += `  "error": "Description of the error"\n`;
    prompt += `}\n`;
    prompt += `\`\`\`\n\n`;

    prompt += `### SECONDARY METHOD: Claude Code Task Tools\n`;
    prompt += `Use built-in task tracking:\n`;
    prompt += `1. At start: \`TaskCreate\` with subject: "${currentTask.title}"\n`;
    prompt += `2. As you work: \`TaskUpdate\` with status: 'in_progress'\n`;
    prompt += `3. When complete: \`TaskUpdate\` with status: 'completed'\n\n`;

    prompt += `### FALLBACK METHOD: Terminal Signal\n`;
    prompt += `End your response with the word DONE when complete (legacy support)\n\n`;

    prompt += `## Instructions:\n`;
    prompt += `1. Complete the current task described above\n`;
    prompt += `2. Test your work to make sure it functions correctly\n`;
    prompt += `3. Commit your changes with a descriptive message\n`;
    prompt += `4. **CRITICAL**: Write the completion status to \`.ralph/status.json\` with all required fields\n`;
    prompt += `5. Optionally use Claude Code's TaskCreate/TaskUpdate tools for additional tracking\n`;
    prompt += `6. End your response with DONE as a fallback signal\n`;
    prompt += `\n`;
    prompt += `**Important:** The system will automatically detect completion from the status file.\n`;
    prompt += `Make sure to include the git commit hash and test results in the completion status.\n`;

    return prompt;
  }

  // Build verification prompt to check if stuck task is actually complete
  buildVerificationPrompt(sessionName) {
    const currentTask = this.sessionManager.getCurrentTask(sessionName);
    if (!currentTask) return null;

    const prd = this.sessionManager.loadPrd(sessionName);
    const state = this.getLoopState(sessionName);

    let prompt = '';

    // Add project context
    if (prd) {
      prompt += `# Project: ${prd.name}\n`;
      if (prd.description) {
        prompt += `${prd.description}\n`;
      }
      prompt += '\n';
    }

    // Add task context
    prompt += `## Task Verification Required\n\n`;
    prompt += `**Current Task:** ${currentTask.title}\n`;
    if (currentTask.description) {
      prompt += `**Description:** ${currentTask.description}\n`;
    }
    prompt += `**Attempts:** ${currentTask.attempts}\n`;
    prompt += `**Last Progress:** ${currentTask.progress}%\n\n`;

    // Add verification instructions
    prompt += `## Verification Protocol\n\n`;
    prompt += `The system detected that this task may be stuck (${state?.circuitBreaker?.noProgressCount || 0} iterations with no progress).\n\n`;
    prompt += `Please review your work and provide a status assessment:\n\n`;

    prompt += `### If the task IS COMPLETE:\n`;
    prompt += `1. Write the completion status to \`.ralph/status.json\`:\n`;
    prompt += `\`\`\`json\n`;
    prompt += `{\n`;
    prompt += `  "version": "1.0",\n`;
    prompt += `  "status": "completed",\n`;
    prompt += `  "task": "${currentTask.id}",\n`;
    prompt += `  "progress": 100,\n`;
    prompt += `  "currentStep": "Verified complete",\n`;
    prompt += `  "timestamp": "${new Date().toISOString()}",\n`;
    prompt += `  "result": {\n`;
    prompt += `    "success": true,\n`;
    prompt += `    "message": "Task verified complete",\n`;
    prompt += `    "gitCommit": "<commit-hash>",\n`;
    prompt += `    "verified": true\n`;
    prompt += `  }\n`;
    prompt += `}\n`;
    prompt += `\`\`\`\n`;
    prompt += `2. Respond with: "VERIFICATION: TASK COMPLETED"\n\n`;

    prompt += `### If the task is NOT complete:\n`;
    prompt += `1. Explain what's blocking completion\n`;
    prompt += `2. Write status to \`.ralph/status.json\`:\n`;
    prompt += `\`\`\`json\n`;
    prompt += `{\n`;
    prompt += `  "version": "1.0",\n`;
    prompt += `  "status": "blocked",\n`;
    prompt += `  "task": "${currentTask.id}",\n`;
    prompt += `  "progress": ${currentTask.progress || 0},\n`;
    prompt += `  "currentStep": "Blocked - needs resolution",\n`;
    prompt += `  "timestamp": "${new Date().toISOString()}",\n`;
    prompt += `  "error": "Description of what's blocking"\n`;
    prompt += `}\n`;
    prompt += `\`\`\`\n`;
    prompt += `3. Respond with: "VERIFICATION: TASK BLOCKED - <reason>"\n\n`;

    prompt += `### If the task needs MORE WORK:\n`;
    prompt += `1. Continue working on the task\n`;
    prompt += `2. Update status file as you progress\n`;
    prompt += `3. Mark complete when done\n\n`;

    prompt += `Please provide your assessment now.\n`;

    return prompt;
  }

  // Resume loop with verification (asks Claude if task is complete)
  async resumeWithVerification(sessionName) {
    const state = this.getLoopState(sessionName);
    if (!state) throw new Error('No loop state found');
    if (state.status !== 'stuck') {
      throw new Error('Can only verify when stuck');
    }

    const currentTask = this.sessionManager.getCurrentTask(sessionName);
    if (!currentTask) {
      throw new Error('No current task to verify');
    }

    console.log(`[Ralph] Starting verification for task: ${currentTask.title}`);

    // Build verification prompt
    const prompt = this.buildVerificationPrompt(sessionName);

    // Reset circuit breaker for verification attempt
    state.circuitBreaker.noProgressCount = 0;
    state.circuitBreaker.errorCount = 0;
    state.status = 'running';
    state.pausedAt = null;

    this.updateSessionMeta(sessionName, state);
    this.emit('verification_started', { sessionName, state, taskId: currentTask.id });

    // Send verification prompt
    try {
      await this.restartSessionWithPrompt(sessionName, prompt);
    } catch (err) {
      console.error(`[Ralph] Failed to send verification prompt: ${err.message}`);
      state.status = 'stuck';
      state.circuitBreaker.errorCount++;
      this.updateSessionMeta(sessionName, state);
      throw err;
    }

    return state;
  }

  // Start the Ralph loop for a session
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

    // Check if there are tasks to do
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

    // Update session metadata
    this.updateSessionMeta(sessionName, state);

    this.emit('started', { sessionName, state });
    this.sessionManager.logIteration(sessionName, state.iterationCount + 1);

    // Run first iteration
    await this.runIteration(sessionName);

    return state;
  }

  // Pause the loop
  pauseLoop(sessionName) {
    const state = this.getLoopState(sessionName);
    if (!state) throw new Error('No loop state found');
    if (state.status !== 'running') throw new Error('Loop is not running');

    state.status = 'paused';
    state.pausedAt = new Date().toISOString();

    this.updateSessionMeta(sessionName, state);
    this.emit('paused', { sessionName, state });

    return state;
  }

  // Resume a paused loop
  async resumeLoop(sessionName) {
    const state = this.getLoopState(sessionName);
    if (!state) throw new Error('No loop state found');
    if (state.status !== 'paused' && state.status !== 'stuck') {
      throw new Error('Loop is not paused or stuck');
    }

    // Reset circuit breaker if resuming from stuck
    if (state.status === 'stuck') {
      state.circuitBreaker.noProgressCount = 0;
      state.circuitBreaker.errorCount = 0;
    }

    state.status = 'running';
    state.pausedAt = null;

    this.updateSessionMeta(sessionName, state);
    this.emit('resumed', { sessionName, state });

    // Continue iteration
    await this.runIteration(sessionName);

    return state;
  }

  // Stop the loop completely
  stopLoop(sessionName) {
    const state = this.getLoopState(sessionName);
    if (!state) return null;

    state.status = 'idle';
    state.pausedAt = new Date().toISOString();

    this.updateSessionMeta(sessionName, state);
    this.emit('stopped', { sessionName, state });

    return state;
  }

  // Run a single iteration
  async runIteration(sessionName) {
    const state = this.getLoopState(sessionName);
    if (!state || state.status !== 'running') return;

    state.iterationCount++;
    state.lastIterationAt = new Date().toISOString();

    const currentTask = this.sessionManager.getCurrentTask(sessionName);
    if (!currentTask) {
      // All tasks complete
      state.status = 'complete';
      state.completedAt = new Date().toISOString();
      this.updateSessionMeta(sessionName, state);
      this.emit('complete', { sessionName, state });
      return;
    }

    state.currentTaskId = currentTask.id;
    this.sessionManager.logTaskStart(sessionName, currentTask.title);

    // Build prompt for this iteration
    const prompt = this.buildPrompt(sessionName);

    // Restart session with new prompt (fresh context)
    try {
      await this.restartSessionWithPrompt(sessionName, prompt);
    } catch (err) {
      this.sessionManager.logError(sessionName, `Failed to restart session: ${err.message}`);
      state.circuitBreaker.errorCount++;
      this.checkCircuitBreaker(sessionName, state);
      return;
    }

    this.updateSessionMeta(sessionName, state);
    this.emit('iteration', { sessionName, state, taskId: currentTask.id, iteration: state.iterationCount });

    // Schedule completion check after delay (let AI work)
    // In practice, this would be triggered by output monitoring
    // For now, we'll rely on manual analysis or periodic checks
  }

  // Restart the session with a fresh prompt
  async restartSessionWithPrompt(sessionName, prompt) {
    const meta = this.sessionManager.get(sessionName);
    if (!meta) throw new Error('Session not found');
    const { execSync } = require('child_process');
    const fs = require('fs');
    const path = require('path');
    const TMUX_BIN = '/usr/bin/tmux';

    console.log(`[Ralph] Restarting session for next task`);

    // Capture scrollback
    this.sessionManager.captureScrollback(sessionName);

    // Kill and recreate session for fresh context
    if (meta.alive) {
      this.sessionManager.stop(sessionName);
      await this.sleep(2000);
    }

    // Save prompt and revive
    const sessionData = this.sessionManager.data.sessions[sessionName];
    if (sessionData) {
      sessionData.initialPrompt = prompt;
      this.sessionManager.save();
    }

    this.sessionManager.revive(sessionName);
    await this.sleep(3000); // Wait for Claude to start

    // Write prompt to temp file (safer than shell escaping)
    console.log(`[Ralph] Sending prompt to Claude...`);
    const tmpFile = path.join('/tmp', `ralph-prompt-${Date.now()}.txt`);
    try {
      fs.writeFileSync(tmpFile, prompt);

      // Send prompt via tmux load-buffer and paste-buffer
      execSync(`${TMUX_BIN} load-buffer "${tmpFile}"`, { timeout: 2000 });
      execSync(`${TMUX_BIN} paste-buffer -t "${meta.tmuxSession}"`, { timeout: 2000 });
      execSync(`${TMUX_BIN} send-keys -t "${meta.tmuxSession}" Enter`, { timeout: 2000 });

      // Cleanup
      fs.unlinkSync(tmpFile);

      console.log(`[Ralph] ✓ Prompt sent successfully`);
      await this.sleep(2000);
    } catch (err) {
      console.error(`[Ralph] Failed to send prompt: ${err.message}`);
      // Cleanup on error
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }
  }

  // Process completion of current task
  processTaskCompletion(sessionName, analysis) {
    const state = this.getLoopState(sessionName);
    if (!state) return;

    const currentTask = this.sessionManager.getCurrentTask(sessionName);
    if (!currentTask) return;

    if (analysis.completion.isComplete) {
      // Task completed successfully
      this.sessionManager.markTaskComplete(sessionName, currentTask.id);
      this.sessionManager.logTaskComplete(sessionName, currentTask.title);

      // Reset circuit breaker on success
      state.circuitBreaker.noProgressCount = 0;
      state.circuitBreaker.errorCount = 0;
      state.lastExitSignal = true;

      // CRITICAL: Reset status to 'running' if it was stuck
      // This allows the next task to start automatically
      if (state.status === 'stuck') {
        console.log(`[Ralph] Task completed - resetting status from 'stuck' to 'running'`);
        state.status = 'running';
        state.pausedAt = null;
      }

      this.emit('taskComplete', { sessionName, state, taskId: currentTask.id });

      // Check if all tasks done
      const nextTask = this.sessionManager.getCurrentTask(sessionName);
      if (!nextTask) {
        state.status = 'complete';
        state.completedAt = new Date().toISOString();
        this.updateSessionMeta(sessionName, state);
        this.emit('complete', { sessionName, state });
        return;
      }

      // Continue to next iteration (status is now guaranteed to be 'running')
      if (state.status === 'running') {
        console.log(`[Ralph] Starting next task: ${nextTask.title}`);
        this.sessionManager.logIteration(sessionName, state.iterationCount + 1);
        this.runIteration(sessionName);
      }
    } else if (analysis.stuck.isStuck) {
      // Task appears stuck
      this.sessionManager.incrementTaskAttempts(sessionName, currentTask.id);
      state.circuitBreaker.noProgressCount++;

      // Log errors as learnings
      for (const error of analysis.stuck.errors.slice(0, 3)) {
        this.sessionManager.logError(sessionName, `${error.type}: ${error.message}`);
      }

      this.checkCircuitBreaker(sessionName, state);
    } else {
      // Not complete, not stuck - keep waiting or retry
      state.circuitBreaker.noProgressCount++;
      this.checkCircuitBreaker(sessionName, state);
    }
  }

  // Check and trigger circuit breaker if needed
  checkCircuitBreaker(sessionName, state) {
    const threshold = state.circuitBreaker.threshold;

    if (state.circuitBreaker.noProgressCount >= threshold ||
        state.circuitBreaker.errorCount >= threshold) {
      state.status = 'stuck';
      state.pausedAt = new Date().toISOString();

      this.updateSessionMeta(sessionName, state);
      this.emit('stuck', {
        sessionName,
        state,
        reason: state.circuitBreaker.noProgressCount >= threshold
          ? 'no_progress'
          : 'repeated_errors'
      });
    }
  }

  // Update session metadata with loop state
  updateSessionMeta(sessionName, state) {
    const sessionData = this.sessionManager.data.sessions[sessionName];
    if (!sessionData) return;

    sessionData.mode = 'ralph';
    sessionData.loopConfig = {
      maxIterations: state.maxIterations,
      iterationCount: state.iterationCount,
      status: state.status,
      lastExitSignal: state.lastExitSignal,
      circuitBreaker: { ...state.circuitBreaker }
    };

    // Update task stats
    const taskStats = this.sessionManager.getTaskStats(sessionName);
    sessionData.tasks = taskStats;

    this.sessionManager.save();
  }

  // Helper: sleep
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Get status for all active loops
  getAllLoopStatus() {
    const result = {};
    for (const [sessionName, state] of this.activeLoops) {
      result[sessionName] = {
        status: state.status,
        iterationCount: state.iterationCount,
        maxIterations: state.maxIterations,
        currentTaskId: state.currentTaskId,
        circuitBreaker: state.circuitBreaker
      };
    }
    return result;
  }
}

module.exports = RalphLoop;
