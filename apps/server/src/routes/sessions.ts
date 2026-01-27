import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { sessionService } from '../services/SessionService';
import { createSessionSchema } from '@vibemanager/shared';

const sessions = new Hono();

// List all sessions
sessions.get('/', async (c) => {
  try {
    const list = await sessionService.list();
    return c.json({ success: true, data: list });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Get last active session
sessions.get('/last', async (c) => {
  try {
    const session = await sessionService.getLastActive();
    return c.json({ success: true, data: session });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Get session by name or ID
sessions.get('/:id', async (c) => {
  try {
    const { id } = c.req.param();
    const session = await sessionService.get(id);
    if (!session) {
      return c.json({ success: false, error: 'Session not found' }, 404);
    }
    return c.json({ success: true, data: session });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Create session
sessions.post(
  '/',
  zValidator('json', createSessionSchema),
  async (c) => {
    try {
      const input = c.req.valid('json');
      const session = await sessionService.create(input);
      return c.json({ success: true, data: session }, 201);
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 400);
    }
  }
);

// Delete session
sessions.delete('/:id', async (c) => {
  try {
    const { id } = c.req.param();
    await sessionService.delete(id);
    return c.json({ success: true });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 400);
  }
});

// Stop session
sessions.post('/:id/stop', async (c) => {
  try {
    const { id } = c.req.param();
    await sessionService.stop(id);
    return c.json({ success: true });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 400);
  }
});

// Revive session
sessions.post('/:id/revive', async (c) => {
  try {
    const { id } = c.req.param();
    const session = await sessionService.revive(id);
    return c.json({ success: true, data: session });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 400);
  }
});

// Get scrollback
sessions.get('/:id/scrollback', async (c) => {
  try {
    const { id } = c.req.param();
    const scrollback = await sessionService.getScrollback(id);
    return c.json({ success: true, data: scrollback });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Set preview port
sessions.put('/:id/preview-port', async (c) => {
  try {
    const { id } = c.req.param();
    const body = await c.req.json();
    const port = body.port as number | null;
    await sessionService.setPreviewPort(id, port);
    return c.json({ success: true });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 400);
  }
});

export default sessions;
