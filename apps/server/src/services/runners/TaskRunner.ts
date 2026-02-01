import { EventEmitter } from 'events';
import type { Task } from '@vibemanager/shared';

export interface TaskRunnerEvents {
  'iteration:start': { task: Task; iteration: number };
  'iteration:complete': { task: Task; iteration: number; output: string };
  'verification:start': { task: Task };
  'verification:complete': { task: Task; passed: boolean; feedback: string };
  'status:update': { task: Task; message: string };
  'task:complete': { task: Task; result: string };
  'task:failed': { task: Task; error: string };
  'task:paused': { task: Task };
  'task:resumed': { task: Task };
  'task:cancelled': { task: Task };
}

export interface RunnerStatus {
  running: boolean;
  iteration: number;
  paused: boolean;
}

/**
 * Abstract base class for task runners.
 * Runners handle the execution lifecycle of tasks with different strategies.
 */
export abstract class TaskRunner extends EventEmitter {
  /**
   * Start executing a task
   */
  abstract start(task: Task): Promise<void>;

  /**
   * Pause a running task
   */
  abstract pause(task: Task): Promise<void>;

  /**
   * Resume a paused task
   */
  abstract resume(task: Task): Promise<void>;

  /**
   * Cancel a running or paused task
   */
  abstract cancel(task: Task): Promise<void>;

  /**
   * Get current status of a task within this runner
   */
  abstract getStatus(task: Task): RunnerStatus;

  /**
   * Check if this runner can handle a task
   */
  abstract canHandle(task: Task): boolean;

  // Typed event emitter methods
  emit<K extends keyof TaskRunnerEvents>(event: K, data: TaskRunnerEvents[K]): boolean {
    return super.emit(event, data);
  }

  on<K extends keyof TaskRunnerEvents>(event: K, listener: (data: TaskRunnerEvents[K]) => void): this {
    return super.on(event, listener);
  }

  once<K extends keyof TaskRunnerEvents>(event: K, listener: (data: TaskRunnerEvents[K]) => void): this {
    return super.once(event, listener);
  }

  off<K extends keyof TaskRunnerEvents>(event: K, listener: (data: TaskRunnerEvents[K]) => void): this {
    return super.off(event, listener);
  }
}
