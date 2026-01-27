import app from './app';
import { handleUpgrade, handleOpen, handleMessage, handleClose, type WebSocketData } from './ws/handler';
import { DEFAULT_PORT } from '@vibemanager/shared';
import { codeServerService } from './services/CodeServerService';

// Run migrations on startup
import './db/migrate';

const PORT = parseInt(process.env.PORT || String(DEFAULT_PORT), 10);

console.log(`Starting VibeManager server on port ${PORT}...`);

// Start code-server for the Code tab
codeServerService.start();

const server = Bun.serve<WebSocketData>({
  port: PORT,
  async fetch(req, server) {
    // Handle WebSocket upgrade
    const upgradeData = await handleUpgrade(req);
    if (upgradeData) {
      const success = server.upgrade(req, { data: upgradeData });
      if (success) {
        return undefined; // Bun handles the response
      }
      return new Response('Unauthorized', { status: 401 });
    }

    // Check if this was a WebSocket request that failed auth
    const url = new URL(req.url);
    if (url.pathname === '/ws' || url.pathname === '/status') {
      return new Response('Unauthorized', { status: 401 });
    }

    // Handle HTTP requests with Hono
    return app.fetch(req);
  },
  websocket: {
    async open(ws) {
      await handleOpen(ws);
    },
    message(ws, message) {
      handleMessage(ws, message);
    },
    close(ws) {
      handleClose(ws);
    },
  },
});

console.log(`VibeManager server running at http://localhost:${server.port}`);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  codeServerService.stop();
  server.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down...');
  codeServerService.stop();
  server.stop();
  process.exit(0);
});
