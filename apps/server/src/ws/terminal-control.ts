import type { ServerWebSocket } from 'bun';
import { spawn } from 'child_process';
import { sessionService } from '../services/SessionService';
import { getTmuxSessionName, captureScrollback } from '../lib/tmux';
import { findTmux } from '../lib/tools';
import { DEFAULT_COLS, DEFAULT_ROWS } from '@vibemanager/shared';

const TMUX = findTmux();

interface ControlConnection {
  process: ReturnType<typeof spawn> | null;
  sessionName: string;
  tmuxSession: string;
  cols: number;
  rows: number;
  refreshInterval: ReturnType<typeof setInterval> | null;
}

// Track active connections
const connections = new Map<ServerWebSocket<unknown>, ControlConnection>();

/**
 * Handle new WebSocket connection for terminal using tmux control mode
 */
export async function handleTerminalConnection(
  ws: ServerWebSocket<unknown>,
  sessionName: string,
  cols = DEFAULT_COLS,
  rows = DEFAULT_ROWS
): Promise<void> {
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

  const tmuxSession = getTmuxSessionName(session.name);

  // Get initial scrollback
  const initialContent = captureScrollback(session.name, 1000);

  // Store connection info
  const conn: ControlConnection = {
    process: null,
    sessionName: session.name,
    tmuxSession,
    cols,
    rows,
    refreshInterval: null,
  };
  connections.set(ws, conn);

  // Send attached message
  ws.send(JSON.stringify({
    type: 'attached',
    session: session.name,
    projectPath: session.projectPath,
    shell: session.shell,
  }));

  // Send initial content
  if (initialContent) {
    ws.send(JSON.stringify({ type: 'data', data: initialContent }));
  }

  // Set up periodic refresh to capture new output
  let lastContent = initialContent;
  conn.refreshInterval = setInterval(() => {
    try {
      const content = captureScrollback(session.name, 100);
      if (content !== lastContent) {
        // Clear screen and redraw
        ws.send(JSON.stringify({ type: 'data', data: '\x1b[2J\x1b[H' + content }));
        lastContent = content;
      }
    } catch (err) {
      // Session might have ended
      cleanup(ws);
    }
  }, 100); // Refresh every 100ms

  sessionService.touch(session.id);
}

/**
 * Handle incoming WebSocket message
 */
export function handleTerminalMessage(ws: ServerWebSocket<unknown>, message: string): void {
  const conn = connections.get(ws);
  if (!conn) return;

  try {
    const msg = JSON.parse(message);

    switch (msg.type) {
      case 'data':
        // Send keys to tmux session
        const proc = spawn(TMUX, ['send-keys', '-t', conn.tmuxSession, '-l', msg.data], {
          stdio: 'ignore',
        });
        proc.on('error', () => {});
        break;

      case 'resize':
        // Resize tmux window
        if (msg.cols && msg.rows) {
          conn.cols = msg.cols;
          conn.rows = msg.rows;
          // Note: resize doesn't work well in this mode
        }
        break;
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
    if (conn.refreshInterval) {
      clearInterval(conn.refreshInterval);
    }
    if (conn.process) {
      conn.process.kill();
    }
    connections.delete(ws);
  }
}

export function getConnectionCount(): number {
  return connections.size;
}
