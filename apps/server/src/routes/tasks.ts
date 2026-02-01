import { Hono } from 'hono';
import { taskService } from '../services/TaskService';
import { sessionService } from '../services/SessionService';
import { activityService } from '../services/ActivityService';
import { logService } from '../services/LogService';
import { createTaskSchema, updateTaskSchema } from '@vibemanager/shared';
import { z } from 'zod';

// Schema for creating task with fresh session
const createTaskWithFreshSessionSchema = z.object({
  task: z.object({
    name: z.string().min(1),
    prompt: z.string().min(1),
    runnerType: z.enum(['ralph', 'simple', 'manual']).optional().default('ralph'),
    maxIterations: z.number().min(1).max(100).optional().default(10),
    verificationPrompt: z.string().nullable().optional(),
  }),
  session: z.object({
    name: z.string().min(1),
    projectPath: z.string().min(1),
    shell: z.enum(['claude', 'opencode', 'bash']).default('claude'),
  }),
});

const tasks = new Hono();

// List all tasks (optionally filtered by sessionId query param)
tasks.get('/', async (c) => {
  const sessionId = c.req.query('sessionId');
  const taskList = await taskService.list(sessionId);
  return c.json({ success: true, data: taskList });
});

// Get a single task
tasks.get('/:id', async (c) => {
  const task = await taskService.get(c.req.param('id'));
  if (!task) {
    return c.json({ success: false, error: 'Task not found' }, 404);
  }
  return c.json({ success: true, data: task });
});

// Create a task with a fresh session (creates session, waits for it to be ready, then starts task)
tasks.post('/fresh-session', async (c) => {
  const body = await c.req.json();
  const parsed = createTaskWithFreshSessionSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.message }, 400);
  }

  const { task: taskInput, session: sessionInput } = parsed.data;

  try {
    logService.info('task', `Creating fresh session "${sessionInput.name}" for task "${taskInput.name}"`);

    // Step 1: Create the new session
    const session = await sessionService.create({
      name: sessionInput.name,
      projectPath: sessionInput.projectPath,
      shell: sessionInput.shell,
      autonomous: true, // Always autonomous for task execution
    });

    logService.info('session', `Session "${session.name}" created, waiting for agent to load...`);

    // Step 2: Wait for the agent to fully load
    // Claude and OpenCode need time to initialize
    const loadDelay = sessionInput.shell === 'bash' ? 2000 : 15000; // 15s for Claude/OpenCode, 2s for bash

    // Wait in increments and check for activity
    const maxWaitTime = sessionInput.shell === 'bash' ? 5000 : 30000; // Max 30s for AI agents
    const checkInterval = 2000;
    let waitedTime = 0;
    let isReady = false;

    // Initial delay for startup
    await new Promise(resolve => setTimeout(resolve, loadDelay));
    waitedTime += loadDelay;

    // Poll for idle state (indicates agent has fully loaded)
    while (waitedTime < maxWaitTime && !isReady) {
      activityService.pollSession(session.name);
      const activity = activityService.getActivity(session.name);

      logService.debug('session', `Waiting for session ready: state=${activity.activityState}, waited=${waitedTime}ms`);

      // Consider ready if idle or waiting for input (agent prompt is showing)
      if (activity.activityState === 'idle' || activity.activityState === 'waiting_for_input') {
        // Double-check after a short delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        activityService.pollSession(session.name);
        const recheck = activityService.getActivity(session.name);

        if (recheck.activityState === 'idle' || recheck.activityState === 'waiting_for_input') {
          isReady = true;
          logService.info('session', `Session "${session.name}" is ready (state: ${recheck.activityState})`);
          break;
        }
      }

      await new Promise(resolve => setTimeout(resolve, checkInterval));
      waitedTime += checkInterval;
    }

    if (!isReady) {
      logService.warn('session', `Session "${session.name}" may not be fully ready, proceeding anyway after ${waitedTime}ms`);
    }

    // Step 3: Create the task
    const task = await taskService.create({
      sessionId: session.id,
      name: taskInput.name,
      prompt: taskInput.prompt,
      runnerType: taskInput.runnerType,
      maxIterations: taskInput.maxIterations,
      verificationPrompt: taskInput.verificationPrompt,
      autoStart: false, // We'll start it manually after creation
    });

    logService.info('task', `Task "${task.name}" created, starting...`);

    // Step 4: Start the task
    await taskService.start(task.id);
    const updatedTask = await taskService.get(task.id);

    logService.info('task', `Task "${task.name}" started on fresh session "${session.name}"`);

    return c.json({ success: true, data: updatedTask }, 201);
  } catch (error) {
    logService.error('task', `Failed to create task with fresh session: ${error}`);
    return c.json({ success: false, error: String(error) }, 400);
  }
});

// Create a new task
tasks.post('/', async (c) => {
  const body = await c.req.json();
  const parsed = createTaskSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.message }, 400);
  }

  try {
    const task = await taskService.create(parsed.data);
    return c.json({ success: true, data: task }, 201);
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 400);
  }
});

// Update a task
tasks.patch('/:id', async (c) => {
  const body = await c.req.json();
  const parsed = updateTaskSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.message }, 400);
  }

  try {
    const task = await taskService.update(c.req.param('id'), parsed.data);
    if (!task) {
      return c.json({ success: false, error: 'Task not found' }, 404);
    }
    return c.json({ success: true, data: task });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 400);
  }
});

// Delete a task
tasks.delete('/:id', async (c) => {
  try {
    await taskService.delete(c.req.param('id'));
    return c.json({ success: true, data: null });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 400);
  }
});

// Start a task
tasks.post('/:id/start', async (c) => {
  try {
    await taskService.start(c.req.param('id'));
    const task = await taskService.get(c.req.param('id'));
    return c.json({ success: true, data: task });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 400);
  }
});

// Pause a task
tasks.post('/:id/pause', async (c) => {
  try {
    await taskService.pause(c.req.param('id'));
    const task = await taskService.get(c.req.param('id'));
    return c.json({ success: true, data: task });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 400);
  }
});

// Resume a task
tasks.post('/:id/resume', async (c) => {
  try {
    await taskService.resume(c.req.param('id'));
    const task = await taskService.get(c.req.param('id'));
    return c.json({ success: true, data: task });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 400);
  }
});

// Cancel a task (use ?force=true for stuck tasks)
tasks.post('/:id/cancel', async (c) => {
  const force = c.req.query('force') === 'true';
  try {
    await taskService.cancel(c.req.param('id'), force);
    const task = await taskService.get(c.req.param('id'));
    return c.json({ success: true, data: task });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 400);
  }
});

// Add a task to the queue
tasks.post('/:id/queue', async (c) => {
  try {
    await taskService.queue(c.req.param('id'));
    const task = await taskService.get(c.req.param('id'));
    return c.json({ success: true, data: task });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 400);
  }
});

// Remove a task from the queue
tasks.post('/:id/unqueue', async (c) => {
  try {
    await taskService.unqueue(c.req.param('id'));
    const task = await taskService.get(c.req.param('id'));
    return c.json({ success: true, data: task });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 400);
  }
});

// Complete a manual task
tasks.post('/:id/complete', async (c) => {
  const body = await c.req.json();
  const result = body.result || '';

  try {
    await taskService.completeManual(c.req.param('id'), result);
    const task = await taskService.get(c.req.param('id'));
    return c.json({ success: true, data: task });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 400);
  }
});

export default tasks;
