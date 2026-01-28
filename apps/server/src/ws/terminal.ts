import type { ServerWebSocket } from 'bun';
import { spawn, type ChildProcess } from 'child_process';
import { createInterface } from 'readline';
import { sessionService } from '../services/SessionService';
import { getTmuxSessionName } from '../lib/tmux';
import { findTmux } from '../lib/tools';
import { DEFAULT_COLS, DEFAULT_ROWS } from '@vibemanager/shared';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PTY_WORKER = join(__dirname, '..', 'lib', 'pty-worker.mjs');

interface TerminalConnection {
  process: ChildProcess | null;
  sessionName: string;
  cols: number;
  rows: number;
}

// Track active connections per session
const connections = new Map<ServerWebSocket<unknown>, TerminalConnection>();

/**
 * Handle new WebSocket connection for terminal
 */
export async function handleTerminalConnection(
  ws: ServerWebSocket<unknown>,
  sessionName: string,
  cols = DEFAULT_COLS,
  rows = DEFAULT_ROWS
): Promise<void> {
  // Get session
  const session = await sessionService.get(sessionName);
  if (!session) {
    ws.send(JSON.stringify({ type: 'error', error: 'Session not found' }));
    ws.close(1008, 'Session not found');
    return;
  }

  if (!session.alive) {
    ws.send(JSON.stringify({ type: 'error', error: 'Session is not running' }));
    ws.close(1008, 'Session not running');
    return;
  }

  // Spawn Node.js PTY worker process
  const tmuxSession = getTmuxSessionName(session.name);
  const tmuxPath = findTmux();
  const worker = spawn('node', [PTY_WORKER, tmuxSession, String(cols), String(rows), tmuxPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: session.projectPath,
    env: { ...process.env, TERM: 'xterm-256color' },
  });

  // Store connection
  connections.set(ws, {
    process: worker,
    sessionName: session.name,
    cols,
    rows,
  });

  // Send attached message
  ws.send(
    JSON.stringify({
      type: 'attached',
      session: session.name,
      projectPath: session.projectPath,
      shell: session.shell,
    })
  );

  // Read output from worker
  if (worker.stdout) {
    const rl = createInterface({ input: worker.stdout });
    rl.on('line', (line) => {
      try {
        const msg = JSON.parse(line);
        if (msg.type === 'data') {
          ws.send(JSON.stringify({ type: 'data', data: msg.data }));
        } else if (msg.type === 'exit') {
          ws.send(JSON.stringify({
            type: 'detached',
            code: msg.code,
            reason: 'Terminal exited',
          }));
          cleanup(ws);
        }
      } catch {
        // Ignore parse errors
      }
    });
  }

  // Handle worker errors
  if (worker.stderr) {
    worker.stderr.on('data', (data) => {
      console.error('PTY worker error:', data.toString());
    });
  }

  worker.on('error', (err) => {
    console.error('PTY worker spawn error:', err);
    ws.send(JSON.stringify({
      type: 'detached',
      code: 1,
      reason: 'Failed to spawn terminal',
    }));
    cleanup(ws);
  });

  worker.on('exit', (code) => {
    const conn = connections.get(ws);
    if (conn) {
      ws.send(JSON.stringify({
        type: 'detached',
        code: code || 0,
        reason: 'Terminal exited',
      }));
      cleanup(ws);
    }
  });

  // Update session last accessed
  sessionService.touch(session.id);
}

/**
 * Handle incoming WebSocket message
 */
export function handleTerminalMessage(ws: ServerWebSocket<unknown>, message: string): void {
  const conn = connections.get(ws);
  if (!conn || !conn.process || !conn.process.stdin) return;

  try {
    const msg = JSON.parse(message);

    switch (msg.type) {
      case 'data':
        // Forward input to worker
        conn.process.stdin.write(JSON.stringify({ type: 'data', data: msg.data }) + '\n');
        break;

      case 'resize':
        // Forward resize to worker
        if (msg.cols && msg.rows) {
          conn.process.stdin.write(JSON.stringify({ type: 'resize', cols: msg.cols, rows: msg.rows }) + '\n');
          conn.cols = msg.cols;
          conn.rows = msg.rows;
        }
        break;

      default:
        console.warn('Unknown message type:', msg.type);
    }
  } catch (error) {
    console.error('Error handling terminal message:', error);
  }
}

/**
 * Handle WebSocket close
 */
export function handleTerminalClose(ws: ServerWebSocket<unknown>): void {
  cleanup(ws);
}

/**
 * Cleanup connection
 */
function cleanup(ws: ServerWebSocket<unknown>): void {
  const conn = connections.get(ws);
  if (conn) {
    if (conn.process) {
      try {
        conn.process.kill();
      } catch {
        // Ignore errors
      }
    }
    connections.delete(ws);
  }
}

/**
 * Get number of active connections
 */
export function getConnectionCount(): number {
  return connections.size;
}
