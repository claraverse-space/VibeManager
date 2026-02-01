import { eq, and, asc } from 'drizzle-orm';
import { db, schema } from '../db';
import type { Task, CreateTaskInput, UpdateTaskInput, RunnerType } from '@vibemanager/shared';
import {
  TaskRunner,
  ralphLoopRunner,
  simpleRunner,
  manualRunner,
} from './runners';
import { logService } from './LogService';
import { taskWatchdog } from './TaskWatchdog';

/**
 * Service for managing tasks and their execution via runners
 */
export class TaskService {
  private runners = new Map<RunnerType, TaskRunner>();

  constructor() {
    // Register default runners
    this.registerRunner('ralph', ralphLoopRunner);
    this.registerRunner('simple', simpleRunner);
    this.registerRunner('manual', manualRunner);

    // Set up event handlers for each runner
    this.setupRunnerEvents(ralphLoopRunner);
    this.setupRunnerEvents(simpleRunner);
    this.setupRunnerEvents(manualRunner);
  }

  /**
   * Register a custom runner for a runner type
   */
  registerRunner(type: RunnerType, runner: TaskRunner): void {
    this.runners.set(type, runner);
    this.setupRunnerEvents(runner);
  }

  /**
   * Set up event handlers for a runner
   */
  private setupRunnerEvents(runner: TaskRunner): void {
    runner.on('task:complete', async ({ task, result }) => {
      await this.updateTaskStatus(task.id, 'completed', { result, completedAt: new Date() });
      // Start next queued task for this session
      this.processQueue(task.sessionId).catch(console.error);
    });

    runner.on('task:failed', async ({ task, error }) => {
      await this.updateTaskStatus(task.id, 'failed', { error, completedAt: new Date() });
      // Start next queued task for this session
      this.processQueue(task.sessionId).catch(console.error);
    });

    runner.on('task:paused', async ({ task }) => {
      await this.updateTaskStatus(task.id, 'paused', { statusMessage: 'Paused' });
    });

    runner.on('task:cancelled', async ({ task }) => {
      await this.updateTaskStatus(task.id, 'cancelled', {
        completedAt: new Date(),
        result: task.result || null,
        statusMessage: 'Cancelled',
      });
      // Start next queued task for this session
      this.processQueue(task.sessionId).catch(console.error);
    });

    runner.on('iteration:complete', async ({ task, iteration }) => {
      await this.updateTaskIteration(task.id, iteration);
      // Report progress to watchdog
      await taskWatchdog.recordProgress(task.id);
    });

    runner.on('verification:complete', async ({ task }) => {
      await db
        .update(schema.tasks)
        .set({
          lastVerificationResult: task.lastVerificationResult,
          lastProgressAt: new Date(),  // Update progress on verification
        })
        .where(eq(schema.tasks.id, task.id));
    });

    runner.on('status:update', async ({ task, message }) => {
      await db
        .update(schema.tasks)
        .set({
          statusMessage: message,
          lastProgressAt: new Date(),  // Update progress on status change
        })
        .where(eq(schema.tasks.id, task.id));
    });

    // Listen for iteration start as well
    runner.on('iteration:start', async ({ task }) => {
      await taskWatchdog.recordProgress(task.id);
    });
  }

  /**
   * Create a new task
   */
  async create(input: CreateTaskInput): Promise<Task> {
    const {
      sessionId,
      name,
      prompt,
      runnerType = 'ralph',
      maxIterations = 10,
      verificationPrompt = null,
      autoStart = false,
    } = input;

    const id = crypto.randomUUID();
    const now = new Date();

    const taskRecord: typeof schema.tasks.$inferInsert = {
      id,
      sessionId,
      name,
      prompt,
      runnerType,
      status: 'pending',
      currentIteration: 0,
      maxIterations,
      verificationPrompt,
      createdAt: now,
    };

    await db.insert(schema.tasks).values(taskRecord);

    const task = this.recordToTask(taskRecord as typeof schema.tasks.$inferSelect);

    if (autoStart) {
      await this.start(id);
      return { ...task, status: 'running', startedAt: new Date() };
    }

    return task;
  }

  /**
   * Get a task by ID
   */
  async get(id: string): Promise<Task | null> {
    const record = await db.query.tasks.findFirst({
      where: eq(schema.tasks.id, id),
    });

    if (!record) return null;
    return this.recordToTask(record);
  }

  /**
   * List all tasks, optionally filtered by session
   */
  async list(sessionId?: string): Promise<Task[]> {
    const records = sessionId
      ? await db.query.tasks.findMany({
          where: eq(schema.tasks.sessionId, sessionId),
          orderBy: (t, { desc }) => [desc(t.createdAt)],
        })
      : await db.query.tasks.findMany({
          orderBy: (t, { desc }) => [desc(t.createdAt)],
        });

    return records.map((r) => this.recordToTask(r));
  }

  /**
   * Update a task
   */
  async update(id: string, input: UpdateTaskInput): Promise<Task | null> {
    const existing = await this.get(id);
    if (!existing) return null;

    // Only allow updates to pending tasks
    if (existing.status !== 'pending') {
      throw new Error('Can only update pending tasks');
    }

    await db
      .update(schema.tasks)
      .set({
        name: input.name,
        prompt: input.prompt,
        maxIterations: input.maxIterations,
        verificationPrompt: input.verificationPrompt,
      })
      .where(eq(schema.tasks.id, id));

    return this.get(id);
  }

  /**
   * Delete a task
   */
  async delete(id: string): Promise<void> {
    const task = await this.get(id);
    if (!task) {
      throw new Error(`Task ${id} not found`);
    }

    // Cancel if running
    if (task.status === 'running' || task.status === 'paused') {
      await this.cancel(id);
    }

    await db.delete(schema.tasks).where(eq(schema.tasks.id, id));
  }

  /**
   * Start a task
   */
  async start(id: string): Promise<void> {
    const task = await this.get(id);
    if (!task) {
      throw new Error(`Task ${id} not found`);
    }

    if (task.status !== 'pending') {
      throw new Error(`Task ${id} is not in pending state`);
    }

    // Check if another task is already running on the same session
    const runningOnSession = await this.getRunningTaskForSession(task.sessionId);
    if (runningOnSession) {
      throw new Error(
        `Another task "${runningOnSession.name}" is already running on this session. ` +
        `Wait for it to complete or cancel it first.`
      );
    }

    const runner = this.runners.get(task.runnerType);
    if (!runner) {
      throw new Error(`No runner registered for type ${task.runnerType}`);
    }

    const now = new Date();
    await this.updateTaskStatus(id, 'running', { startedAt: now });
    // Initialize progress tracking for watchdog
    await db
      .update(schema.tasks)
      .set({ lastProgressAt: now, healthCheckFailures: 0 })
      .where(eq(schema.tasks.id, id));

    const updatedTask = await this.get(id);
    if (updatedTask) {
      await runner.start(updatedTask);
    }
  }

  /**
   * Get currently running task for a session (if any)
   */
  async getRunningTaskForSession(sessionId: string): Promise<Task | null> {
    const record = await db.query.tasks.findFirst({
      where: (t, { and, eq, inArray }) =>
        and(
          eq(t.sessionId, sessionId),
          inArray(t.status, ['running', 'paused'])
        ),
    });

    if (!record) return null;
    return this.recordToTask(record);
  }

  /**
   * Pause a task
   */
  async pause(id: string): Promise<void> {
    const task = await this.get(id);
    if (!task) {
      throw new Error(`Task ${id} not found`);
    }

    if (task.status !== 'running') {
      throw new Error(`Task ${id} is not running`);
    }

    const runner = this.runners.get(task.runnerType);
    if (!runner) {
      throw new Error(`No runner registered for type ${task.runnerType}`);
    }

    await runner.pause(task);
  }

  /**
   * Resume a task
   */
  async resume(id: string): Promise<void> {
    const task = await this.get(id);
    if (!task) {
      throw new Error(`Task ${id} not found`);
    }

    if (task.status !== 'paused') {
      throw new Error(`Task ${id} is not paused`);
    }

    const runner = this.runners.get(task.runnerType);
    if (!runner) {
      throw new Error(`No runner registered for type ${task.runnerType}`);
    }

    await this.updateTaskStatus(id, 'running');
    await runner.resume(task);
  }

  /**
   * Cancel a task
   */
  async cancel(id: string, force = false): Promise<void> {
    const task = await this.get(id);
    if (!task) {
      throw new Error(`Task ${id} not found`);
    }

    if (task.status !== 'running' && task.status !== 'paused') {
      throw new Error(`Task ${id} is not running or paused`);
    }

    const runner = this.runners.get(task.runnerType);
    if (!runner) {
      throw new Error(`No runner registered for type ${task.runnerType}`);
    }

    // Check if runner actually has this task
    const runnerStatus = runner.getStatus(task);

    if (!runnerStatus.running && force) {
      // Task is stuck - runner doesn't have it but DB says running
      // Force update the database directly
      await this.updateTaskStatus(id, 'cancelled', {
        completedAt: new Date(),
        statusMessage: 'Force cancelled (task was stuck)',
        error: 'Task was in inconsistent state - runner lost track of it',
      });
      return;
    }

    if (!runnerStatus.running && !force) {
      // Task not actually running - suggest force cancel
      throw new Error(
        `Task ${id} is not actually running in the runner (possibly due to server restart). ` +
        `Use force=true to force cancel.`
      );
    }

    await runner.cancel(task);
  }

  /**
   * Complete a manual task
   */
  async completeManual(id: string, result: string): Promise<void> {
    const task = await this.get(id);
    if (!task) {
      throw new Error(`Task ${id} not found`);
    }

    if (task.runnerType !== 'manual') {
      throw new Error('Only manual tasks can be manually completed');
    }

    if (task.status !== 'running') {
      throw new Error(`Task ${id} is not running`);
    }

    manualRunner.complete(task, result);
  }

  /**
   * Get runner status for a task
   */
  getRunnerStatus(task: Task) {
    const runner = this.runners.get(task.runnerType);
    if (!runner) return null;
    return runner.getStatus(task);
  }

  /**
   * Update task status in database
   */
  private async updateTaskStatus(
    id: string,
    status: Task['status'],
    extra?: Partial<{
      result: string | null;
      error: string;
      statusMessage: string;
      startedAt: Date;
      completedAt: Date;
    }>
  ): Promise<void> {
    await db
      .update(schema.tasks)
      .set({ status, ...extra })
      .where(eq(schema.tasks.id, id));
  }

  /**
   * Update task iteration in database
   */
  private async updateTaskIteration(id: string, iteration: number): Promise<void> {
    await db
      .update(schema.tasks)
      .set({ currentIteration: iteration })
      .where(eq(schema.tasks.id, id));
  }

  /**
   * Convert database record to Task type
   */
  private recordToTask(record: typeof schema.tasks.$inferSelect): Task {
    return {
      id: record.id,
      sessionId: record.sessionId,
      name: record.name,
      prompt: record.prompt,
      runnerType: record.runnerType as RunnerType,
      status: record.status as Task['status'],
      currentIteration: record.currentIteration,
      maxIterations: record.maxIterations,
      verificationPrompt: record.verificationPrompt,
      lastVerificationResult: record.lastVerificationResult,
      statusMessage: record.statusMessage,
      result: record.result,
      error: record.error,
      createdAt: record.createdAt,
      startedAt: record.startedAt,
      completedAt: record.completedAt,
      queuePosition: record.queuePosition,
      lastProgressAt: record.lastProgressAt,
      healthCheckFailures: record.healthCheckFailures,
    };
  }

  /**
   * Add a task to the queue for its session
   * If no other task is running, it will start immediately
   */
  async queue(id: string): Promise<void> {
    const task = await this.get(id);
    if (!task) {
      throw new Error(`Task ${id} not found`);
    }

    if (task.status !== 'pending') {
      throw new Error(`Task ${id} must be in pending state to queue`);
    }

    // Get the next queue position for this session
    const maxPositionResult = await db
      .select({ maxPos: schema.tasks.queuePosition })
      .from(schema.tasks)
      .where(
        and(
          eq(schema.tasks.sessionId, task.sessionId),
          eq(schema.tasks.status, 'queued')
        )
      )
      .orderBy(asc(schema.tasks.queuePosition));

    const positions = maxPositionResult
      .map(r => r.maxPos)
      .filter((p): p is number => p !== null);
    const nextPosition = positions.length > 0 ? Math.max(...positions) + 1 : 1;

    // Update task to queued status
    await db
      .update(schema.tasks)
      .set({
        status: 'queued',
        queuePosition: nextPosition,
        statusMessage: `Queued at position ${nextPosition}`,
      })
      .where(eq(schema.tasks.id, id));

    logService.info('task', `Task "${task.name}" added to queue at position ${nextPosition}`);

    // Try to process the queue (will start if no task is running)
    await this.processQueue(task.sessionId);
  }

  /**
   * Remove a task from the queue (back to pending)
   */
  async unqueue(id: string): Promise<void> {
    const task = await this.get(id);
    if (!task) {
      throw new Error(`Task ${id} not found`);
    }

    if (task.status !== 'queued') {
      throw new Error(`Task ${id} is not in queue`);
    }

    await db
      .update(schema.tasks)
      .set({
        status: 'pending',
        queuePosition: null,
        statusMessage: null,
      })
      .where(eq(schema.tasks.id, id));

    logService.info('task', `Task "${task.name}" removed from queue`);
  }

  /**
   * Process the queue for a session - start the next queued task if no task is running
   */
  async processQueue(sessionId: string): Promise<void> {
    // Check if any task is currently running on this session
    const runningTask = await this.getRunningTaskForSession(sessionId);
    if (runningTask) {
      logService.debug('task', `Queue: Session ${sessionId} has running task, skipping`);
      return;
    }

    // Get the next queued task (lowest queue position)
    const nextTask = await db.query.tasks.findFirst({
      where: and(
        eq(schema.tasks.sessionId, sessionId),
        eq(schema.tasks.status, 'queued')
      ),
      orderBy: asc(schema.tasks.queuePosition),
    });

    if (!nextTask) {
      logService.debug('task', `Queue: No queued tasks for session ${sessionId}`);
      return;
    }

    logService.info('task', `Queue: Auto-starting next task "${nextTask.name}"`);

    // Start the task
    try {
      // First update to pending so start() works
      await db
        .update(schema.tasks)
        .set({ status: 'pending', queuePosition: null })
        .where(eq(schema.tasks.id, nextTask.id));

      await this.start(nextTask.id);
    } catch (error) {
      logService.error('task', `Queue: Failed to auto-start task: ${error}`);
      // Revert to queued status
      await db
        .update(schema.tasks)
        .set({
          status: 'queued',
          queuePosition: nextTask.queuePosition,
          error: `Auto-start failed: ${error}`,
        })
        .where(eq(schema.tasks.id, nextTask.id));
    }
  }

  /**
   * Get all queued tasks for a session in order
   */
  async getQueue(sessionId: string): Promise<Task[]> {
    const records = await db.query.tasks.findMany({
      where: and(
        eq(schema.tasks.sessionId, sessionId),
        eq(schema.tasks.status, 'queued')
      ),
      orderBy: asc(schema.tasks.queuePosition),
    });

    return records.map((r) => this.recordToTask(r));
  }
}

// Export singleton instance
export const taskService = new TaskService();
