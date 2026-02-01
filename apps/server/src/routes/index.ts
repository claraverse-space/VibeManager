import { Hono } from 'hono';
import sessions from './sessions';
import system from './system';
import browse from './browse';
import health from './health';
import code from './code';
import auth from './auth';
import tasks from './tasks';
import settings from './settings';

const api = new Hono();

// Mount routes
api.route('/auth', auth);
api.route('/sessions', sessions);
api.route('/system', system);
api.route('/browse', browse);
api.route('/health', health);
api.route('/code', code);
api.route('/tasks', tasks);
api.route('/settings', settings);

// Alias ports endpoint
api.get('/ports', (c) => {
  return c.redirect('/api/system/ports');
});

export default api;
