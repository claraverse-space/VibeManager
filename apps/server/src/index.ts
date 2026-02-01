import app from './app';
import { handleUpgrade, handleOpen, handleMessage, handleClose, type WebSocketData } from './ws/handler';
import { DEFAULT_PORT } from '@vibemanager/shared';
import { codeServerService } from './services/CodeServerService';
import { fixPtyPermissions } from './lib/fix-pty-permissions';
import { taskWatchdog } from './services/TaskWatchdog';

// Fix node-pty permissions on macOS (must run before any PTY operations)
fixPtyPermissions();

// Run migrations on startup
import './db/migrate';

const PORT = parseInt(process.env.PORT || String(DEFAULT_PORT), 10);

console.log(`Starting VibeManager server on port ${PORT}...`);

// Start code-server for the Code tab
codeServerService.start();

// Extended WebSocket data type to include code-server proxy
type ExtendedWebSocketData = WebSocketData | { type: 'code-proxy'; targetWs: WebSocket | null; path: string };

const server = Bun.serve<ExtendedWebSocketData>({
  port: PORT,
  async fetch(req, server) {
    const url = new URL(req.url);

    // Handle WebSocket upgrade for code-server proxy
    if (url.pathname.startsWith('/code/') && req.headers.get('upgrade')?.toLowerCase() === 'websocket') {
      const port = codeServerService.getPort();
      if (!port) {
        return new Response('code-server not running', { status: 503 });
      }

      const path = url.pathname.replace(/^\/code/, '') + url.search;
      const success = server.upgrade(req, {
        data: { type: 'code-proxy', targetWs: null, path } as ExtendedWebSocketData
      });
      if (success) {
        return undefined;
      }
      return new Response('WebSocket upgrade failed', { status: 500 });
    }

    // Handle WebSocket upgrade for terminal/status
    const upgradeData = await handleUpgrade(req);
    if (upgradeData) {
      const success = server.upgrade(req, { data: upgradeData });
      if (success) {
        return undefined; // Bun handles the response
      }
      return new Response('Unauthorized', { status: 401 });
    }

    // Check if this was a WebSocket request that failed auth
    if (url.pathname === '/ws' || url.pathname === '/status') {
      return new Response('Unauthorized', { status: 401 });
    }

    // Handle HTTP requests with Hono
    return app.fetch(req);
  },
  websocket: {
    async open(ws) {
      const data = ws.data;
      if (data && 'type' in data && data.type === 'code-proxy') {
        // Connect to code-server WebSocket
        const port = codeServerService.getPort();
        if (!port) {
          ws.close(1011, 'code-server not running');
          return;
        }
        const targetUrl = `ws://127.0.0.1:${port}${data.path}`;
        try {
          const targetWs = new WebSocket(targetUrl);
          (data as { targetWs: WebSocket | null }).targetWs = targetWs;

          // Queue messages until target is open
          let pendingMessages: (string | ArrayBuffer)[] = [];
          let targetOpen = false;

          targetWs.addEventListener('open', () => {
            targetOpen = true;
            // Send any queued messages
            for (const msg of pendingMessages) {
              targetWs.send(msg);
            }
            pendingMessages = [];
          });

          targetWs.addEventListener('message', (event) => {
            try {
              if (event.data instanceof Blob) {
                event.data.arrayBuffer().then(buf => {
                  ws.send(new Uint8Array(buf));
                });
              } else {
                ws.send(event.data);
              }
            } catch (e) {
              // Client disconnected
            }
          });

          targetWs.addEventListener('close', (event) => {
            ws.close(event.code, event.reason);
          });

          targetWs.addEventListener('error', (e) => {
            console.error('Code-server WebSocket error:', e);
            ws.close(1011, 'code-server connection error');
          });

          // Store targetOpen and pendingMessages for use in message handler
          (data as any).targetOpen = () => targetOpen;
          (data as any).queueMessage = (msg: string | ArrayBuffer) => {
            if (targetOpen) {
              targetWs.send(msg);
            } else {
              pendingMessages.push(msg);
            }
          };
        } catch (e) {
          console.error('Failed to connect to code-server WebSocket:', e);
          ws.close(1011, 'Failed to connect to code-server');
        }
        return;
      }
      await handleOpen(ws as any);
    },
    message(ws, message) {
      const data = ws.data;
      if (data && 'type' in data && data.type === 'code-proxy') {
        const queueMessage = (data as any).queueMessage;
        if (queueMessage) {
          if (message instanceof Buffer || message instanceof Uint8Array) {
            queueMessage(message);
          } else {
            queueMessage(String(message));
          }
        }
        return;
      }
      handleMessage(ws as any, message);
    },
    close(ws) {
      const data = ws.data;
      if (data && 'type' in data && data.type === 'code-proxy') {
        const targetWs = (data as { targetWs: WebSocket | null }).targetWs;
        if (targetWs) {
          targetWs.close();
        }
        return;
      }
      handleClose(ws as any);
    },
  },
});

console.log(`VibeManager server running at http://localhost:${server.port}`);

// Start the task watchdog for bulletproof task monitoring
taskWatchdog.start();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  taskWatchdog.stop();
  codeServerService.stop();
  server.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down...');
  taskWatchdog.stop();
  codeServerService.stop();
  server.stop();
  process.exit(0);
});
