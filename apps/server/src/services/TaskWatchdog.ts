import { eq, inArray, lt, and } from 'drizzle-orm';
import { db, schema } from '../db';
import { logService } from './LogService';
import { sessionService } from './SessionService';
import { taskService } from './TaskService';
import { activityService } from './ActivityService';
import { captureScrollback, sendCtrlC, sendEscape } from '../lib/tmux';
import type { Task } from '@vibemanager/shared';

/**
 * Task Watchdog Service - Bulletproof task monitoring and recovery
 *
 * This service runs continuously to ensure tasks never get stuck:
 * 1. Health checks every 15 seconds
 * 2. Detects stale tasks (no progress for configurable timeout)
 * 3. Auto-recovers or force-cancels stuck tasks
 * 4. Ensures queue never blocks due to hung tasks
 * 5. Session health monitoring and auto-revival
 */

// ============ CONFIGURATION ============
// These values determine how aggressive the watchdog is

// How often to run health checks (ms)
const WATCHDOG_INTERVAL = 15000; // 15 seconds

// Task is considered "warning" after this time with no progress (ms)
const STALE_WARNING_THRESHOLD = 120000; // 2 minutes

// Task is considered "stuck" after this time with no progress (ms)
const STALE_STUCK_THRESHOLD = 300000; // 5 minutes

// Task is force-cancelled after this time with no progress (ms)
const STALE_CRITICAL_THRESHOLD = 600000; // 10 minutes

// Max consecutive health check failures before force-cancel
const MAX_HEALTH_FAILURES = 5;

// Max time a task can be in "running" status without any progress (ms)
const MAX_RUNNING_WITHOUT_PROGRESS = 900000; // 15 minutes absolute max

// Queue blocking threshold - if queued task waiting longer than this, force-cancel blocking task
const QUEUE_BLOCKING_THRESHOLD = 1800000; // 30 minutes

// ============ WATCHDOG SERVICE ============

class TaskWatchdog {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private lastCheckTime = 0;

  /**
   * Start the watchdog service
   */
  start(): void {
    if (this.isRunning) {
      logService.warn('system', 'TaskWatchdog already running');
      return;
    }

    logService.info('system', '🐕 TaskWatchdog starting - aggressive task monitoring enabled', {
      checkInterval: `${WATCHDOG_INTERVAL / 1000}s`,
      staleWarning: `${STALE_WARNING_THRESHOLD / 60000}m`,
      staleStuck: `${STALE_STUCK_THRESHOLD / 60000}m`,
      staleCritical: `${STALE_CRITICAL_THRESHOLD / 60000}m`,
    });

    this.isRunning = true;
    this.lastCheckTime = Date.now();

    // Run immediately, then on interval
    this.runHealthCheck().catch(console.error);

    this.intervalId = setInterval(() => {
      this.runHealthCheck().catch((error) => {
        logService.error('system', `TaskWatchdog error: ${error.message}`);
      });
    }, WATCHDOG_INTERVAL);
  }

  /**
   * Stop the watchdog service
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    logService.info('system', '🐕 TaskWatchdog stopped');
  }

  /**
   * Main health check routine
   */
  private async runHealthCheck(): Promise<void> {
    const checkStartTime = Date.now();
    this.lastCheckTime = checkStartTime;

    try {
      // Get all running and paused tasks
      const activeTasks = await db.query.tasks.findMany({
        where: inArray(schema.tasks.status, ['running', 'paused']),
      });

      if (activeTasks.length === 0) {
        return; // Nothing to check
      }

      logService.debug('system', `🐕 Watchdog checking ${activeTasks.length} active task(s)`);

      for (const taskRecord of activeTasks) {
        await this.checkTaskHealth(taskRecord);
      }

      // Also check for queue blocking
      await this.checkQueueHealth();

    } catch (error) {
      logService.error('system', `Watchdog health check failed: ${error}`);
    }
  }

  /**
   * Check individual task health
   */
  private async checkTaskHealth(taskRecord: typeof schema.tasks.$inferSelect): Promise<void> {
    const now = Date.now();
    const taskId = taskRecord.id;
    const taskName = taskRecord.name;

    // Determine last progress time
    const lastProgress = taskRecord.lastProgressAt?.getTime() ||
                         taskRecord.startedAt?.getTime() ||
                         taskRecord.createdAt.getTime();

    const timeSinceProgress = now - lastProgress;
    const timeSinceStart = taskRecord.startedAt ? now - taskRecord.startedAt.getTime() : 0;

    // Get session info
    const session = await sessionService.get(taskRecord.sessionId);
    if (!session) {
      logService.error('task', `🐕 Task "${taskName}" has no session - marking failed`, { taskId });
      await this.markTaskFailed(taskId, 'Session was deleted while task was running');
      return;
    }

    // Check session health
    if (!session.alive) {
      logService.warn('task', `🐕 Task "${taskName}" session is dead - attempting revival`, { taskId });

      const revived = await this.tryReviveSession(taskRecord.sessionId);
      if (!revived) {
        // Increment failure counter
        const failures = (taskRecord.healthCheckFailures || 0) + 1;
        await this.updateHealthFailures(taskId, failures);

        if (failures >= MAX_HEALTH_FAILURES) {
          logService.error('task', `🐕 Task "${taskName}" - max health failures reached, force cancelling`, { taskId, failures });
          await this.forceCancel(taskId, 'Session could not be revived after multiple attempts');
        }
        return;
      }

      // Session revived - reset failure counter
      await this.updateHealthFailures(taskId, 0);
      await this.updateProgress(taskId, 'Session revived, continuing...');
      return;
    }

    // Check for activity in the session
    const hasActivity = await this.checkSessionActivity(session.name);

    if (hasActivity) {
      // Task is making progress - reset failure counter and update progress
      if (taskRecord.healthCheckFailures > 0) {
        await this.updateHealthFailures(taskId, 0);
      }
      await this.updateProgress(taskId);
      return;
    }

    // No activity detected - check staleness levels
    if (timeSinceProgress >= STALE_CRITICAL_THRESHOLD || timeSinceStart >= MAX_RUNNING_WITHOUT_PROGRESS) {
      // CRITICAL: Force cancel
      logService.error('task', `🐕 CRITICAL: Task "${taskName}" stuck for ${Math.round(timeSinceProgress / 60000)}m - FORCE CANCELLING`, {
        taskId,
        timeSinceProgress: `${Math.round(timeSinceProgress / 60000)}m`,
        timeSinceStart: `${Math.round(timeSinceStart / 60000)}m`,
      });

      await this.forceCancel(taskId, `Task stuck for ${Math.round(timeSinceProgress / 60000)} minutes without progress`);
      return;
    }

    if (timeSinceProgress >= STALE_STUCK_THRESHOLD) {
      // STUCK: Try to recover
      const failures = (taskRecord.healthCheckFailures || 0) + 1;
      await this.updateHealthFailures(taskId, failures);

      logService.warn('task', `🐕 STUCK: Task "${taskName}" no progress for ${Math.round(timeSinceProgress / 60000)}m - attempting recovery (failure ${failures}/${MAX_HEALTH_FAILURES})`, {
        taskId,
      });

      if (failures >= MAX_HEALTH_FAILURES) {
        await this.forceCancel(taskId, `Task unresponsive after ${MAX_HEALTH_FAILURES} recovery attempts`);
        return;
      }

      // Try to nudge the session
      await this.nudgeSession(session.name);
      return;
    }

    if (timeSinceProgress >= STALE_WARNING_THRESHOLD) {
      // WARNING: Log but don't act yet
      logService.warn('task', `🐕 WARNING: Task "${taskName}" no progress for ${Math.round(timeSinceProgress / 60000)}m`, {
        taskId,
        status: taskRecord.status,
        statusMessage: taskRecord.statusMessage,
      });
    }
  }

  /**
   * Check queue health - ensure no queue is permanently blocked
   */
  private async checkQueueHealth(): Promise<void> {
    // Get all queued tasks
    const queuedTasks = await db.query.tasks.findMany({
      where: eq(schema.tasks.status, 'queued'),
    });

    if (queuedTasks.length === 0) return;

    const now = Date.now();

    for (const queuedTask of queuedTasks) {
      const queuedTime = now - queuedTask.createdAt.getTime();

      if (queuedTime >= QUEUE_BLOCKING_THRESHOLD) {
        // Check what's blocking this queue
        const blockingTask = await db.query.tasks.findFirst({
          where: and(
            eq(schema.tasks.sessionId, queuedTask.sessionId),
            inArray(schema.tasks.status, ['running', 'paused'])
          ),
        });

        if (blockingTask) {
          const blockingTime = blockingTask.startedAt
            ? now - blockingTask.startedAt.getTime()
            : 0;

          logService.warn('task', `🐕 Queue blocked: Task "${queuedTask.name}" waiting ${Math.round(queuedTime / 60000)}m, blocked by "${blockingTask.name}" running for ${Math.round(blockingTime / 60000)}m`, {
            queuedTaskId: queuedTask.id,
            blockingTaskId: blockingTask.id,
          });

          // If blocking task has been running too long, force cancel it
          if (blockingTime >= QUEUE_BLOCKING_THRESHOLD) {
            logService.error('task', `🐕 Force cancelling blocking task "${blockingTask.name}" to unblock queue`, {
              blockingTaskId: blockingTask.id,
            });
            await this.forceCancel(blockingTask.id, 'Force cancelled to unblock queue after excessive wait time');
          }
        }
      }
    }
  }

  /**
   * Check if session has recent activity
   */
  private async checkSessionActivity(sessionName: string): Promise<boolean> {
    try {
      activityService.pollSession(sessionName);
      const activity = activityService.getActivity(sessionName);

      // Consider active if there was output in last 30 seconds
      const timeSinceOutput = Date.now() - activity.lastOutputAt;
      return timeSinceOutput < 30000;
    } catch {
      return false;
    }
  }

  /**
   * Try to revive a dead session
   */
  private async tryReviveSession(sessionId: string): Promise<boolean> {
    try {
      await sessionService.revive(sessionId);
      // Wait for revival
      await new Promise(resolve => setTimeout(resolve, 3000));

      const session = await sessionService.get(sessionId);
      return session?.alive ?? false;
    } catch (error) {
      logService.error('session', `Failed to revive session: ${error}`);
      return false;
    }
  }

  /**
   * Nudge a stuck session to try to get it moving
   */
  private async nudgeSession(sessionName: string): Promise<void> {
    try {
      // Send Ctrl+C to interrupt any stuck process
      sendCtrlC(sessionName);
      await new Promise(resolve => setTimeout(resolve, 500));

      // Send ESC to clear any modal state
      sendEscape(sessionName, 2);
      await new Promise(resolve => setTimeout(resolve, 500));

      logService.info('task', `🐕 Nudged session ${sessionName}`);
    } catch (error) {
      logService.error('task', `Failed to nudge session: ${error}`);
    }
  }

  /**
   * Force cancel a stuck task
   */
  private async forceCancel(taskId: string, reason: string): Promise<void> {
    try {
      // First try normal cancel with force flag
      await taskService.cancel(taskId, true);
    } catch {
      // If that fails, update database directly
      await db
        .update(schema.tasks)
        .set({
          status: 'failed',
          error: `Watchdog: ${reason}`,
          statusMessage: 'Force cancelled by watchdog',
          completedAt: new Date(),
          healthCheckFailures: 0,
        })
        .where(eq(schema.tasks.id, taskId));
    }

    // Get the task to process queue
    const task = await taskService.get(taskId);
    if (task) {
      // Process queue to start next task
      await taskService.processQueue(task.sessionId);
    }

    logService.error('task', `🐕 Task ${taskId} force cancelled: ${reason}`);
  }

  /**
   * Mark a task as failed
   */
  private async markTaskFailed(taskId: string, error: string): Promise<void> {
    await db
      .update(schema.tasks)
      .set({
        status: 'failed',
        error,
        statusMessage: 'Failed - ' + error,
        completedAt: new Date(),
        healthCheckFailures: 0,
      })
      .where(eq(schema.tasks.id, taskId));

    const task = await taskService.get(taskId);
    if (task) {
      await taskService.processQueue(task.sessionId);
    }
  }

  /**
   * Update health check failure count
   */
  private async updateHealthFailures(taskId: string, failures: number): Promise<void> {
    await db
      .update(schema.tasks)
      .set({ healthCheckFailures: failures })
      .where(eq(schema.tasks.id, taskId));
  }

  /**
   * Update task progress timestamp
   */
  private async updateProgress(taskId: string, statusMessage?: string): Promise<void> {
    const updates: Partial<typeof schema.tasks.$inferInsert> = {
      lastProgressAt: new Date(),
    };

    if (statusMessage) {
      updates.statusMessage = statusMessage;
    }

    await db
      .update(schema.tasks)
      .set(updates)
      .where(eq(schema.tasks.id, taskId));
  }

  /**
   * Record task progress (called by runners)
   */
  async recordProgress(taskId: string): Promise<void> {
    await this.updateProgress(taskId);
  }

  /**
   * Get watchdog status
   */
  getStatus() {
    return {
      running: this.isRunning,
      lastCheck: this.lastCheckTime,
      config: {
        checkInterval: WATCHDOG_INTERVAL,
        staleWarningThreshold: STALE_WARNING_THRESHOLD,
        staleStuckThreshold: STALE_STUCK_THRESHOLD,
        staleCriticalThreshold: STALE_CRITICAL_THRESHOLD,
        maxHealthFailures: MAX_HEALTH_FAILURES,
      },
    };
  }
}

// Export singleton
export const taskWatchdog = new TaskWatchdog();
