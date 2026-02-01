import type { Task } from '@vibemanager/shared';
import { TaskRunner, type RunnerStatus } from './TaskRunner';

/**
 * Manual Runner - task tracking only, no automation
 * Tasks are tracked but execution is manual by the user.
 * Start/complete is controlled via API.
 */
export class ManualRunner extends TaskRunner {
  private taskStatuses = new Map<string, { started: boolean }>();

  canHandle(task: Task): boolean {
    return task.runnerType === 'manual';
  }

  async start(task: Task): Promise<void> {
    this.taskStatuses.set(task.id, { started: true });
    this.emit('iteration:start', { task, iteration: 1 });
    // Manual runner doesn't do anything automatically
    // The task stays in "running" until manually completed
  }

  async pause(_task: Task): Promise<void> {
    // Manual tasks don't have pause - they're already "manual"
    throw new Error('Manual tasks cannot be paused');
  }

  async resume(_task: Task): Promise<void> {
    throw new Error('Manual tasks cannot be resumed');
  }

  async cancel(task: Task): Promise<void> {
    this.taskStatuses.delete(task.id);
    this.emit('task:cancelled', { task });
  }

  getStatus(task: Task): RunnerStatus {
    const status = this.taskStatuses.get(task.id);
    return {
      running: status?.started ?? false,
      iteration: 1,
      paused: false,
    };
  }

  /**
   * Manually mark a task as complete
   * This is called via the TaskService when user completes a manual task
   */
  complete(task: Task, result: string): void {
    this.taskStatuses.delete(task.id);
    this.emit('task:complete', { task, result });
  }

  /**
   * Manually mark a task as failed
   */
  fail(task: Task, error: string): void {
    this.taskStatuses.delete(task.id);
    this.emit('task:failed', { task, error });
  }
}

export const manualRunner = new ManualRunner();
