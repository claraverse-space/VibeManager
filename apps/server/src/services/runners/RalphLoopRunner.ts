import type { Task } from '@vibemanager/shared';
import { TaskRunner, type RunnerStatus } from './TaskRunner';
import { llmVerifier } from './LLMVerifier';
import { activityService } from '../ActivityService';
import { sendKeys, sendEscape, sendCtrlC, captureScrollback } from '../../lib/tmux';
import { sessionService } from '../SessionService';
import { logService } from '../LogService';

// Poll interval for checking activity state (ms)
const POLL_INTERVAL = 2000;
// Interval for status updates (ms)
const STATUS_UPDATE_INTERVAL = 5000;
// Max time to wait for a single iteration (ms)
const ITERATION_TIMEOUT = 300000; // 5 minutes
// Max time to wait for session to become idle before starting (ms)
const IDLE_WAIT_TIMEOUT = 30000; // 30 seconds

interface RunningTask {
  task: Task;
  iteration: number;
  paused: boolean;
  abortController: AbortController;
  sessionName: string;
}

/**
 * Ralph Loop Runner - implements the full feedback loop:
 * 1. Send prompt to session
 * 2. Wait for completion (idle or waiting_for_input)
 * 3. Capture output
 * 4. Verify with LLM
 * 5. If failed: inject feedback, continue to next iteration
 * 6. If passed or max iterations: complete task
 */
export class RalphLoopRunner extends TaskRunner {
  private runningTasks = new Map<string, RunningTask>();

  canHandle(task: Task): boolean {
    return task.runnerType === 'ralph';
  }

  async start(task: Task): Promise<void> {
    if (this.runningTasks.has(task.id)) {
      throw new Error(`Task ${task.id} is already running`);
    }

    logService.info('task', `Starting task: ${task.name}`, { taskId: task.id, runnerType: 'ralph' });

    // Verify session exists and is alive
    const session = await sessionService.get(task.sessionId);
    if (!session) {
      logService.error('task', `Session not found: ${task.sessionId}`);
      throw new Error(`Session ${task.sessionId} not found`);
    }
    if (!session.alive) {
      logService.error('task', `Session not alive: ${session.name}`);
      throw new Error(`Session ${task.sessionId} is not alive`);
    }

    logService.info('session', `Using session: ${session.name}`, { sessionId: task.sessionId });

    const abortController = new AbortController();
    const runningTask: RunningTask = {
      task,
      iteration: 0,
      paused: false,
      abortController,
      sessionName: session.name,
    };

    this.runningTasks.set(task.id, runningTask);

    // Start the loop asynchronously
    this.runLoop(runningTask).catch((error) => {
      logService.error('task', `Ralph loop error: ${error.message}`, { taskId: task.id });
      this.emit('task:failed', { task: runningTask.task, error: error.message });
      this.runningTasks.delete(task.id);
    });
  }

  async pause(task: Task): Promise<void> {
    const running = this.runningTasks.get(task.id);
    if (!running) {
      throw new Error(`Task ${task.id} is not running`);
    }

    // Send ESC twice to interrupt the agent
    sendEscape(running.sessionName, 2);

    running.paused = true;
    running.task = { ...running.task, statusMessage: 'Paused' };
    this.emit('status:update', { task: running.task, message: 'Paused' });
    this.emit('task:paused', { task: running.task });
  }

  async resume(task: Task): Promise<void> {
    const running = this.runningTasks.get(task.id);
    if (!running) {
      throw new Error(`Task ${task.id} is not running`);
    }

    if (!running.paused) {
      return; // Already running
    }

    // Send "continue" to resume the agent
    sendKeys(running.sessionName, 'continue');

    running.paused = false;
    running.task = { ...running.task, statusMessage: 'Resuming...' };
    this.emit('status:update', { task: running.task, message: 'Resuming...' });
    this.emit('task:resumed', { task: running.task });
  }

  async cancel(task: Task): Promise<void> {
    const running = this.runningTasks.get(task.id);
    if (!running) {
      return; // Already stopped
    }

    // Send ESC and Ctrl+C to stop the agent
    sendEscape(running.sessionName, 2);

    // Capture final output before cancelling
    const finalOutput = captureScrollback(running.sessionName, 2000);
    running.task = {
      ...running.task,
      statusMessage: 'Cancelled',
      result: finalOutput,
    };

    running.abortController.abort();
    this.runningTasks.delete(task.id);
    this.emit('task:cancelled', { task: running.task });
  }

  getStatus(task: Task): RunnerStatus {
    const running = this.runningTasks.get(task.id);
    if (!running) {
      return { running: false, iteration: task.currentIteration, paused: false };
    }

    return {
      running: true,
      iteration: running.iteration,
      paused: running.paused,
    };
  }

  /**
   * Check if session is alive and revive if needed
   */
  private async ensureSessionAlive(runningTask: RunningTask): Promise<boolean> {
    const session = await sessionService.get(runningTask.task.sessionId);

    if (!session) {
      return false;
    }

    if (!session.alive) {
      runningTask.task = { ...runningTask.task, statusMessage: 'Session dead, reviving...' };
      this.emit('status:update', { task: runningTask.task, message: 'Session dead, reviving...' });

      try {
        await sessionService.revive(runningTask.task.sessionId);
        // Wait for session to start
        await this.sleep(3000);

        // Update session name in case it changed
        const revivedSession = await sessionService.get(runningTask.task.sessionId);
        if (revivedSession) {
          runningTask.sessionName = revivedSession.name;
        }
        return true;
      } catch (error) {
        console.error('Failed to revive session:', error);
        return false;
      }
    }

    return true;
  }

  /**
   * Wait for session to be idle and prepare it for task execution
   */
  private async prepareSession(runningTask: RunningTask): Promise<boolean> {
    // First ensure session is alive
    const isAlive = await this.ensureSessionAlive(runningTask);
    if (!isAlive) {
      throw new Error('Session is not available and could not be revived');
    }

    // Use the potentially updated session name
    const currentSessionName = runningTask.sessionName;
    const startTime = Date.now();

    runningTask.task = { ...runningTask.task, statusMessage: 'Waiting for session to be idle...' };
    this.emit('status:update', { task: runningTask.task, message: 'Waiting for session to be idle...' });

    // First, check current activity
    activityService.pollSession(currentSessionName);
    let activity = activityService.getActivity(currentSessionName);

    // If not idle, wait for it
    while (activity.activityState === 'active') {
      if (Date.now() - startTime > IDLE_WAIT_TIMEOUT) {
        // Timeout - try to interrupt and continue anyway
        runningTask.task = { ...runningTask.task, statusMessage: 'Session busy, interrupting...' };
        this.emit('status:update', { task: runningTask.task, message: 'Session busy, interrupting...' });

        // Send Ctrl+C and ESC to interrupt (ignore failures)
        sendCtrlC(currentSessionName);
        await this.sleep(500);
        sendEscape(currentSessionName, 2);
        await this.sleep(1000);
        break;
      }

      await this.sleep(POLL_INTERVAL);
      activityService.pollSession(currentSessionName);
      activity = activityService.getActivity(currentSessionName);
    }

    // Clear any pending input and prepare fresh state
    runningTask.task = { ...runningTask.task, statusMessage: 'Preparing session...' };
    this.emit('status:update', { task: runningTask.task, message: 'Preparing session...' });

    // Send Ctrl+C to cancel any pending input (ignore failures)
    sendCtrlC(currentSessionName);
    await this.sleep(300);

    // Send ESC twice to ensure we're in normal mode (ignore failures)
    sendEscape(currentSessionName, 2);
    await this.sleep(300);

    return true;
  }

  /**
   * Main execution loop
   */
  private async runLoop(runningTask: RunningTask): Promise<void> {
    const { task, abortController } = runningTask;
    const signal = abortController.signal;

    // Prepare session before starting
    await this.prepareSession(runningTask);

    if (signal.aborted) return;

    // Initial prompt for first iteration
    let prompt = task.prompt;

    while (runningTask.iteration < task.maxIterations) {
      // Check if cancelled
      if (signal.aborted) {
        return;
      }

      // Wait if paused
      while (runningTask.paused && !signal.aborted) {
        await this.sleep(1000);
      }

      if (signal.aborted) {
        return;
      }

      runningTask.iteration++;
      const statusMsg = `Iteration ${runningTask.iteration} starting...`;
      runningTask.task = {
        ...runningTask.task,
        currentIteration: runningTask.iteration,
        statusMessage: statusMsg,
      };

      this.emit('iteration:start', { task: runningTask.task, iteration: runningTask.iteration });
      this.emit('status:update', { task: runningTask.task, message: statusMsg });

      // Step 1: Send prompt to session
      const sent = sendKeys(runningTask.sessionName, prompt);
      if (!sent) {
        // Session might be dead, try to recover
        runningTask.task = { ...runningTask.task, statusMessage: 'Send failed, recovering...' };
        this.emit('status:update', { task: runningTask.task, message: 'Send failed, recovering...' });

        const recovered = await this.ensureSessionAlive(runningTask);
        if (!recovered) {
          throw new Error('Session is not available and could not be revived');
        }

        // Retry sending
        const retried = sendKeys(runningTask.sessionName, prompt);
        if (!retried) {
          throw new Error('Failed to send keys to session after recovery');
        }
      }

      // Step 2: Wait for completion (idle or waiting_for_input)
      const completed = await this.waitForCompletion(runningTask.sessionName, signal, runningTask);
      if (!completed) {
        if (signal.aborted) return;
        // Timeout - continue to next iteration
        this.emit('iteration:complete', {
          task: runningTask.task,
          iteration: runningTask.iteration,
          output: 'Iteration timed out',
        });
        prompt = 'The previous operation timed out. Please continue or retry.';
        continue;
      }

      // Step 3: Capture output
      const output = captureScrollback(runningTask.sessionName, 5000);
      this.emit('iteration:complete', {
        task: runningTask.task,
        iteration: runningTask.iteration,
        output,
      });

      // Step 4: Verify with LLM
      runningTask.task = { ...runningTask.task, statusMessage: 'Verifying completion...' };
      this.emit('status:update', { task: runningTask.task, message: 'Verifying completion...' });
      this.emit('verification:start', { task: runningTask.task });
      const verificationResult = await llmVerifier.verify(runningTask.task, output);

      const verifyStatusMsg = verificationResult.passed
        ? 'Verification passed!'
        : `Not complete: ${verificationResult.feedback.slice(0, 50)}...`;

      runningTask.task = {
        ...runningTask.task,
        lastVerificationResult: JSON.stringify(verificationResult),
        statusMessage: verifyStatusMsg,
      };

      this.emit('status:update', { task: runningTask.task, message: verifyStatusMsg });
      this.emit('verification:complete', {
        task: runningTask.task,
        passed: verificationResult.passed,
        feedback: verificationResult.feedback,
      });

      // Step 5: Check result
      if (verificationResult.passed) {
        // Task completed successfully
        this.runningTasks.delete(task.id);
        this.emit('task:complete', { task: runningTask.task, result: output });
        return;
      }

      // Step 6: Prepare feedback for next iteration
      prompt = this.buildFeedbackPrompt(verificationResult.feedback);
    }

    // Max iterations reached
    this.runningTasks.delete(task.id);
    this.emit('task:failed', {
      task: runningTask.task,
      error: `Max iterations (${task.maxIterations}) reached without verification passing`,
    });
  }

  /**
   * Wait for session to become idle or waiting for input
   */
  private async waitForCompletion(
    sessionName: string,
    signal: AbortSignal,
    runningTask: RunningTask
  ): Promise<boolean> {
    const startTime = Date.now();
    let lastStatusUpdate = 0;
    let lastLoggedState = '';
    let lastProgressEmit = 0;

    logService.info('activity', `Waiting for completion on session: ${sessionName}`);

    while (Date.now() - startTime < ITERATION_TIMEOUT) {
      if (signal.aborted) {
        logService.warn('task', 'Task aborted while waiting for completion');
        return false;
      }

      // Poll the session for activity
      activityService.pollSession(sessionName);
      const activity = activityService.getActivity(sessionName);

      // Log state changes
      if (activity.activityState !== lastLoggedState) {
        const timeSinceOutput = Date.now() - activity.lastOutputAt;
        logService.debug('activity', `State changed: ${lastLoggedState || 'init'} -> ${activity.activityState}`, {
          session: sessionName,
          timeSinceOutput: `${Math.round(timeSinceOutput / 1000)}s`,
        });
        lastLoggedState = activity.activityState;
      }

      // Emit progress event every 10 seconds for watchdog
      const now = Date.now();
      if (now - lastProgressEmit >= 10000) {
        lastProgressEmit = now;
        // Emit a heartbeat to let watchdog know we're still working
        if (activity.activityState === 'active') {
          this.emit('status:update', {
            task: runningTask.task,
            message: runningTask.task.statusMessage || `Iteration ${runningTask.iteration} - Working...`,
          });
        }
      }

      // Periodically update status message
      if (now - lastStatusUpdate >= STATUS_UPDATE_INTERVAL) {
        lastStatusUpdate = now;
        logService.debug('activity', `Polling status update...`, { state: activity.activityState });
        this.updateStatusMessage(sessionName, runningTask).catch(() => {});
      }

      if (activity.activityState === 'idle' || activity.activityState === 'waiting_for_input') {
        logService.info('activity', `Session appears ${activity.activityState}, rechecking in 1s...`);
        // Give it a moment to ensure it's truly done
        await this.sleep(1000);
        activityService.pollSession(sessionName);
        const recheck = activityService.getActivity(sessionName);
        if (recheck.activityState === 'idle' || recheck.activityState === 'waiting_for_input') {
          logService.info('activity', `Confirmed ${recheck.activityState} - proceeding to verification`);
          return true;
        }
        logService.debug('activity', `Recheck failed - back to ${recheck.activityState}`);
      }

      await this.sleep(POLL_INTERVAL);
    }

    return false; // Timeout
  }

  /**
   * Update status message from current output
   */
  private async updateStatusMessage(sessionName: string, runningTask: RunningTask): Promise<void> {
    try {
      const output = captureScrollback(sessionName, 500);
      let message = `Iteration ${runningTask.iteration} - Working...`;

      try {
        const summary = await llmVerifier.getStatusSummary(runningTask.task.name, output);
        if (summary) {
          message = summary;
        }
      } catch {
        // Use default message if LLM fails
      }

      runningTask.task = { ...runningTask.task, statusMessage: message };
      this.emit('status:update', { task: runningTask.task, message });
    } catch (error) {
      console.error('Error updating status:', error);
    }
  }

  /**
   * Build feedback prompt for next iteration
   */
  private buildFeedbackPrompt(feedback: string): string {
    return `The previous attempt was not successful. Here's the feedback:

${feedback}

Please address the issues mentioned above and continue working on the task.`;
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const ralphLoopRunner = new RalphLoopRunner();
