/**
 * Ralph Loop Execution Engine
 *
 * Manages autonomous AI coding loops:
 * - Iterates through tasks until complete
 * - Fresh context each iteration
 * - Tracks progress and detects completion (status file + log-based)
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
    this.detectionIntervals = new Map(); // sessionName -> interval
    this.botConfig = null; // Will be set via setConfig

    // Detection settings
    this.detectionSettings = {
      method: 'both', // 'logs', 'status_file', 'both'
      interval: 60 // seconds
    };
  }

  // Set bot config reference for provider access
  setConfig(botConfig) {
    this.botConfig = botConfig;
  }

  // Check if LLM provider is configured
  isProviderConfigured() {
    if (!this.botConfig) return false;
    const provider = this.botConfig.get('provider.name');
    const apiKey = this.botConfig.get('provider.apiKey');
    const baseUrl = this.botConfig.get('provider.baseUrl');
    return !!(provider && apiKey && baseUrl);
  }

  // Get provider config
  getProviderConfig() {
    if (!this.botConfig) return null;
    return {
      provider: this.botConfig.get('provider.name'),
      baseUrl: this.botConfig.get('provider.baseUrl'),
      apiKey: this.botConfig.get('provider.apiKey'),
      model: this.botConfig.get('provider.model') || 'gpt-4o-mini'
    };
  }

  // Call LLM to analyze task completion status
  async analyzeWithLLM(sessionName, logs, currentTask) {
    const config = this.getProviderConfig();
    if (!config) return null;

    // Use a concise prompt to save tokens
    const prompt = `Task: "${currentTask.title}"

Output log:
${logs.slice(-2000)}

Is this task completed? Check for: git commits, passing tests, "DONE" signal, or completion messages.

Reply ONLY with JSON: {"status":"completed"|"in_progress"|"error","confidence":0.0-1.0,"reason":"why"}`;

    try {
      let response = await this.callLLM(config, prompt);
      if (!response) return null;

      // Strip markdown code fences if present
      response = response.replace(/```json\n?/g, '').replace(/```\n?/g, '');

      // Parse JSON response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        console.log(`[Ralph] LLM analysis: ${result.status} (confidence: ${result.confidence}) - ${result.reason}`);
        return result;
      }
    } catch (err) {
      console.error(`[Ralph] LLM analysis error: ${err.message}`);
    }

    return null;
  }

  // Make HTTP request to LLM provider
  callLLM(config, prompt) {
    return new Promise((resolve, reject) => {
      const url = new URL(config.baseUrl + '/chat/completions');
      const protocol = url.protocol === 'https:' ? https : http;

      const body = JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
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
              // Get content, or fall back to reasoning_content for some providers
              let content = json.choices[0].message.content;
              if (!content && json.choices[0].message.reasoning_content) {
                // Some models put reasoning in a separate field, try to extract JSON from it
                const reasoning = json.choices[0].message.reasoning_content;
                const jsonMatch = reasoning.match(/\{[\s\S]*?"status"[\s\S]*?\}/);
                if (jsonMatch) {
                  content = jsonMatch[0];
                }
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

  // Update detection settings
  updateDetectionSettings(settings) {
    this.detectionSettings = { ...this.detectionSettings, ...settings };
    console.log('[Ralph] Detection settings updated:', this.detectionSettings);

    // Restart any active detection intervals with new settings
    for (const [sessionName] of this.activeLoops) {
      this.restartDetection(sessionName);
    }
  }

  // Start periodic log-based detection for a session
  startLogDetection(sessionName) {
    // Clear any existing interval
    this.stopLogDetection(sessionName);

    const intervalMs = this.detectionSettings.interval * 1000;

    console.log(`[Ralph] Starting log-based detection for ${sessionName} (every ${this.detectionSettings.interval}s)`);

    const interval = setInterval(async () => {
      await this.checkForCompletion(sessionName);
    }, intervalMs);

    this.detectionIntervals.set(sessionName, interval);
  }

  // Stop log detection for a session
  stopLogDetection(sessionName) {
    const interval = this.detectionIntervals.get(sessionName);
    if (interval) {
      clearInterval(interval);
      this.detectionIntervals.delete(sessionName);
      console.log(`[Ralph] Stopped log-based detection for ${sessionName}`);
    }
  }

  // Restart detection with current settings
  restartDetection(sessionName) {
    const state = this.getLoopState(sessionName);
    if (state && state.status === 'running') {
      this.startLogDetection(sessionName);
    }
  }

  // Check for task completion using logs and status file
  async checkForCompletion(sessionName) {
    const state = this.getLoopState(sessionName);
    if (!state || state.status !== 'running') return;

    const currentTask = this.sessionManager.getCurrentTask(sessionName);
    if (!currentTask) return;

    const method = this.detectionSettings.method;

    // Always check status file first (most reliable)
    let statusFileComplete = false;
    if (method === 'status_file' || method === 'both') {
      statusFileComplete = await this.checkStatusFile(sessionName);
    }

    if (statusFileComplete) {
      console.log(`[Ralph] Task completion detected via status file for ${sessionName}`);
      this.processTaskCompletion(sessionName, {
        completion: { isComplete: true },
        stuck: { isStuck: false, errors: [] }
      });
      return;
    }

    // Check logs - use LLM if configured, otherwise pattern matching
    if (method === 'logs' || method === 'both') {
      const logs = this.sessionManager.getScrollbackContent(sessionName, 'latest');
      if (!logs) return;

      const recentLogs = logs.split('\n').slice(-100).join('\n');

      if (this.isProviderConfigured()) {
        // Use LLM for intelligent analysis
        console.log(`[Ralph] Using LLM to analyze task status for ${sessionName}`);
        const analysis = await this.analyzeWithLLM(sessionName, recentLogs, currentTask);

        if (analysis && analysis.confidence >= 0.7) {
          if (analysis.status === 'completed') {
            console.log(`[Ralph] LLM detected task completion for ${sessionName}`);

            // Update status file with LLM analysis
            this.writeStatusFile(sessionName, currentTask, analysis);

            this.processTaskCompletion(sessionName, {
              completion: { isComplete: true },
              stuck: { isStuck: false, errors: [] }
            });
            return;
          } else if (analysis.status === 'error' || analysis.status === 'blocked') {
            console.log(`[Ralph] LLM detected task ${analysis.status} for ${sessionName}: ${analysis.reason}`);
            state.circuitBreaker.noProgressCount++;
            this.checkCircuitBreaker(sessionName, state);
            return;
          }
          // If in_progress, just continue waiting
        }
      } else {
        // Fall back to pattern-based detection
        const logComplete = await this.checkLogsPattern(recentLogs);

        if (logComplete) {
          console.log(`[Ralph] Pattern-based completion detected for ${sessionName}`);
          this.processTaskCompletion(sessionName, {
            completion: { isComplete: true },
            stuck: { isStuck: false, errors: [] }
          });
        }
      }
    }
  }

  // Write status file after LLM detection
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
        currentStep: 'Detected complete by LLM',
        timestamp: new Date().toISOString(),
        result: {
          success: true,
          message: analysis.reason,
          detectedBy: 'llm',
          confidence: analysis.confidence
        }
      };

      fs.writeFileSync(statusPath, JSON.stringify(status, null, 2));
      console.log(`[Ralph] Wrote status file for ${sessionName}`);
    } catch (err) {
      console.error(`[Ralph] Failed to write status file: ${err.message}`);
    }
  }

  // Check status file for completion
  async checkStatusFile(sessionName) {
    try {
      const session = this.sessionManager.get(sessionName);
      if (!session) return false;

      const statusPath = path.join(session.projectPath, '.ralph', 'status.json');
      if (!fs.existsSync(statusPath)) return false;

      const content = fs.readFileSync(statusPath, 'utf-8');
      const status = JSON.parse(content);

      return status.status === 'completed';
    } catch (err) {
      return false;
    }
  }

  // Pattern-based log checking (used when no LLM provider configured)
  async checkLogsPattern(logsContent) {
    try {
      if (!logsContent) return false;

      const lines = logsContent.split('\n');
      const recentContent = logsContent.toLowerCase();

      // Check for completion signals
      const completionSignals = [
        'task completed',
        'done',
        '[done]',
        '[complete]',
        'all tasks complete',
        'verified and committed',
        'commit hash:',
        'successfully committed'
      ];

      // Check for any completion signal
      for (const signal of completionSignals) {
        if (recentContent.includes(signal)) {
          // Verify it's recent (check if git commit was made)
          if (this.verifyRecentCompletion(lines)) {
            return true;
          }
        }
      }

      return false;
    } catch (err) {
      console.error(`[Ralph] Error in pattern-based log check:`, err.message);
      return false;
    }
  }

  // Verify the completion signal is recent and valid
  verifyRecentCompletion(lines) {
    // Look for git commit in recent output
    const recentLines = lines.slice(-30).join('\n');

    // Check for commit success patterns
    const commitPatterns = [
      /\[[\w-]+\s+[a-f0-9]+\]/i, // [main abc1234] style
      /create mode/i,
      /files? changed/i,
      /insertions?\(\+\)/i,
      /deletions?\(-\)/i
    ];

    for (const pattern of commitPatterns) {
      if (pattern.test(recentLines)) {
        return true;
      }
    }

    // Also check for explicit DONE signal at end
    const lastFewLines = lines.slice(-5).join('\n').toLowerCase();
    if (lastFewLines.includes('done')) {
      return true;
    }

    return false;
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

    // IMPORTANT: Clear any stale status file from previous tasks
    // This prevents false completion detection from old status.json files
    this.sessionManager.clearStatusFile(sessionName);

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

    // Start log-based detection
    this.startLogDetection(sessionName);

    // Run first iteration
    await this.runIteration(sessionName);

    return state;
  }

  // Pause the loop
  pauseLoop(sessionName) {
    const state = this.getLoopState(sessionName);
    if (!state) throw new Error('No loop state found');
    if (state.status !== 'running') throw new Error('Loop is not running');

    // Stop log detection while paused
    this.stopLogDetection(sessionName);

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

    // Clear any stale status file
    this.sessionManager.clearStatusFile(sessionName);

    // Reset circuit breaker if resuming from stuck
    if (state.status === 'stuck') {
      state.circuitBreaker.noProgressCount = 0;
      state.circuitBreaker.errorCount = 0;
    }

    state.status = 'running';
    state.pausedAt = null;

    this.updateSessionMeta(sessionName, state);
    this.emit('resumed', { sessionName, state });

    // Restart log detection
    this.startLogDetection(sessionName);

    // Continue iteration
    await this.runIteration(sessionName);

    return state;
  }

  // Stop the loop completely
  stopLoop(sessionName) {
    const state = this.getLoopState(sessionName);
    if (!state) return null;

    // Stop log detection
    this.stopLogDetection(sessionName);

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
