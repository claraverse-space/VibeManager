import { Hono } from 'hono';
import { getAvailableShells } from '../lib/tools';

const health = new Hono();

// Health check
health.get('/', (c) => {
  return c.json({
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      availableShells: getAvailableShells(),
    },
  });
});

export default health;
