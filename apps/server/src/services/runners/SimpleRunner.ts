import type { Task } from '@vibemanager/shared';
import { TaskRunner, type RunnerStatus } from './TaskRunner';
import { activityService } from '../ActivityService';
import { sendKeys, sendCtrlC, sendEscape, captureScrollback } from '../../lib/tmux';
import { sessionService } from '../SessionService';

// Poll interval for checking activity state (ms)
const POLL_INTERVAL = 2000;
// Max time to wait for completion (ms)
const EXECUTION_TIMEOUT = 300000; // 5 minutes
// Max time to wait for session to become idle (ms)
const IDLE_WAIT_TIMEOUT = 30000;

interface RunningTask {
  task: Task;
  abortController: AbortController;
  sessionName: string;
}

/**
 * Simple Runner - single iteration, no verification
 * 1. Send prompt to session
 * 2. Wait for completion (idle or waiting_for_input)
 * 3. Capture output
 * 4. Mark complete
 */
export class SimpleRunner extends TaskRunner {
  private runningTasks = new Map<string, RunningTask>();

  canHandle(task: Task): boolean {
    return task.runnerType === 'simple';
  }

  async start(task: Task): Promise<void> {
    if (this.runningTasks.has(task.id)) {
      throw new Error(`Task ${task.id} is already running`);
    }

    // Verify session exists and is alive
    const session = await sessionService.get(task.sessionId);
    if (!session) {
      throw new Error(`Session ${task.sessionId} not found`);
    }
    if (!session.alive) {
      throw new Error(`Session ${task.sessionId} is not alive`);
    }

    const abortController = new AbortController();
    const runningTask: RunningTask = {
      task,
      abortController,
      sessionName: session.name,
    };

    this.runningTasks.set(task.id, runningTask);

    // Run asynchronously
    this.execute(runningTask).catch((error) => {
      console.error(`Simple runner error for task ${task.id}:`, error);
      this.emit('task:failed', { task: runningTask.task, error: error.message });
      this.runningTasks.delete(task.id);
    });
  }

  async pause(_task: Task): Promise<void> {
    // Simple runner doesn't support pause - it's a single operation
    throw new Error('Simple runner does not support pause');
  }

  async resume(_task: Task): Promise<void> {
    // Simple runner doesn't support resume
    throw new Error('Simple runner does not support resume');
  }

  async cancel(task: Task): Promise<void> {
    const running = this.runningTasks.get(task.id);
    if (!running) {
      return;
    }

    running.abortController.abort();
    this.runningTasks.delete(task.id);
    this.emit('task:cancelled', { task: running.task });
  }

  getStatus(task: Task): RunnerStatus {
    const running = this.runningTasks.get(task.id);
    return {
      running: running !== undefined,
      iteration: running ? 1 : task.currentIteration,
      paused: false,
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
        await this.sleep(3000);

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
   * Wait for session to be idle and prepare it
   */
  private async prepareSession(runningTask: RunningTask): Promise<void> {
    // First ensure session is alive
    const isAlive = await this.ensureSessionAlive(runningTask);
    if (!isAlive) {
      throw new Error('Session is not available and could not be revived');
    }

    const sessionName = runningTask.sessionName;
    const startTime = Date.now();

    // Check current activity
    activityService.pollSession(sessionName);
    let activity = activityService.getActivity(sessionName);

    // Wait for idle if active
    while (activity.activityState === 'active') {
      if (Date.now() - startTime > IDLE_WAIT_TIMEOUT) {
        // Timeout - interrupt and continue
        sendCtrlC(sessionName);
        await this.sleep(500);
        sendEscape(sessionName, 2);
        await this.sleep(1000);
        break;
      }

      await this.sleep(POLL_INTERVAL);
      activityService.pollSession(sessionName);
      activity = activityService.getActivity(sessionName);
    }

    // Clear any pending input
    sendCtrlC(sessionName);
    await this.sleep(300);
    sendEscape(sessionName, 2);
    await this.sleep(300);
  }

  /**
   * Execute the task
   */
  private async execute(runningTask: RunningTask): Promise<void> {
    const { task, abortController } = runningTask;
    const signal = abortController.signal;

    // Prepare session first
    await this.prepareSession(runningTask);

    if (signal.aborted) return;

    this.emit('iteration:start', { task, iteration: 1 });

    // Send prompt to session
    const sent = sendKeys(runningTask.sessionName, task.prompt);
    if (!sent) {
      // Session might be dead, try to recover
      runningTask.task = { ...runningTask.task, statusMessage: 'Send failed, recovering...' };
      this.emit('status:update', { task: runningTask.task, message: 'Send failed, recovering...' });

      const recovered = await this.ensureSessionAlive(runningTask);
      if (!recovered) {
        throw new Error('Session is not available and could not be revived');
      }

      // Retry sending
      const retried = sendKeys(runningTask.sessionName, task.prompt);
      if (!retried) {
        throw new Error('Failed to send keys to session after recovery');
      }
    }

    // Wait for completion
    const completed = await this.waitForCompletion(runningTask.sessionName, signal);
    if (signal.aborted) {
      return;
    }

    // Capture output
    const output = captureScrollback(runningTask.sessionName, 5000);
    this.emit('iteration:complete', { task, iteration: 1, output });

    this.runningTasks.delete(task.id);

    if (completed) {
      this.emit('task:complete', { task, result: output });
    } else {
      this.emit('task:failed', { task, error: 'Execution timed out' });
    }
  }

  /**
   * Wait for session to become idle or waiting for input
   */
  private async waitForCompletion(
    sessionName: string,
    signal: AbortSignal
  ): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < EXECUTION_TIMEOUT) {
      if (signal.aborted) {
        return false;
      }

      activityService.pollSession(sessionName);
      const activity = activityService.getActivity(sessionName);

      if (activity.activityState === 'idle' || activity.activityState === 'waiting_for_input') {
        await this.sleep(1000);
        activityService.pollSession(sessionName);
        const recheck = activityService.getActivity(sessionName);
        if (recheck.activityState === 'idle' || recheck.activityState === 'waiting_for_input') {
          return true;
        }
      }

      await this.sleep(POLL_INTERVAL);
    }

    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const simpleRunner = new SimpleRunner();
