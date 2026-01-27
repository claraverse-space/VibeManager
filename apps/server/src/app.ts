import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import api from './routes';
import preview from './routes/preview';
import { codeProxy } from './routes/code';
import { authMiddleware } from './middleware/auth';

const app = new Hono();

// Middleware
app.use('*', logger());

// Dynamic CORS - allow localhost, private networks, and Tailscale
app.use(
  '*',
  cors({
    origin: (origin) => {
      // Allow no-origin (same origin requests)
      if (!origin) return '*';

      // Allow localhost variants
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return origin;
      }

      // Allow Tailscale IPs (100.x.x.x range)
      if (/^https?:\/\/100\.\d+\.\d+\.\d+(:\d+)?$/.test(origin)) {
        return origin;
      }

      // Allow Tailscale Funnel domains
      if (origin.endsWith('.ts.net')) {
        return origin;
      }

      // Allow private network IPs (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
      if (/^https?:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(origin)) {
        return origin;
      }

      // Reject other origins
      return null;
    },
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

// Auth middleware for API routes and proxy routes
app.use('/api/*', authMiddleware);
app.use('/preview/*', authMiddleware);
app.use('/code/*', authMiddleware);

// API routes
app.route('/api', api);

// Preview proxy route (for remote access to dev server ports)
app.route('/preview', preview);

// Code-server proxy route (for remote access to code-server)
app.route('/code', codeProxy);

// Health check at root
app.get('/', (c) => {
  return c.json({
    name: 'VibeManager API',
    version: '2.0.0',
    status: 'ok',
  });
});

export default app;
