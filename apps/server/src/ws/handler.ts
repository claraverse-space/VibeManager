import type { ServerWebSocket } from 'bun';
import {
  handleTerminalConnection,
  handleTerminalMessage,
  handleTerminalClose,
} from './terminal';
import {
  handleStatusConnection,
  handleStatusClose,
} from './status';
import {
  handleLogsWebSocket,
  handleLogsClose,
} from './logs';
import { validateToken } from '../middleware/auth';
import { authService } from '../services/AuthService';

interface WebSocketData {
  type: 'terminal' | 'status' | 'logs';
  sessionName?: string;
  cols?: number;
  rows?: number;
  authenticated?: boolean;
  userId?: string;
}

/**
 * Handle WebSocket upgrade - validates auth token
 */
export async function handleUpgrade(req: Request): Promise<WebSocketData | null> {
  const url = new URL(req.url);
  const pathname = url.pathname;
  const token = url.searchParams.get('token');

  // Check if setup is required (no auth needed during initial setup)
  const setupRequired = await authService.isSetupRequired();

  // Validate token if auth is required
  let authenticated = setupRequired; // Skip auth during setup
  let userId: string | undefined;

  if (!setupRequired) {
    if (!token) {
      return null; // Reject - no token provided
    }

    const authResult = await validateToken(token);
    if (!authResult) {
      return null; // Reject - invalid token
    }

    authenticated = true;
    userId = authResult.userId;
  }

  // Status WebSocket
  if (pathname === '/status') {
    return { type: 'status', authenticated, userId };
  }

  // Logs WebSocket
  if (pathname === '/logs') {
    return { type: 'logs', authenticated, userId };
  }

  // Terminal WebSocket - check for /ws path with session parameter
  if (pathname === '/ws' || pathname === '/') {
    const sessionName = url.searchParams.get('session');
    if (sessionName) {
      const cols = parseInt(url.searchParams.get('cols') || '120', 10);
      const rows = parseInt(url.searchParams.get('rows') || '30', 10);
      return { type: 'terminal', sessionName, cols, rows, authenticated, userId };
    }
  }

  return null;
}

/**
 * Handle WebSocket open
 */
export async function handleOpen(ws: ServerWebSocket<WebSocketData>): Promise<void> {
  const data = ws.data;

  if (data.type === 'status') {
    handleStatusConnection(ws);
  } else if (data.type === 'logs') {
    handleLogsWebSocket(ws);
  } else if (data.type === 'terminal' && data.sessionName) {
    await handleTerminalConnection(ws, data.sessionName, data.cols, data.rows);
  }
}

/**
 * Handle WebSocket message
 */
export function handleMessage(ws: ServerWebSocket<WebSocketData>, message: string | Buffer): void {
  const data = ws.data;
  const messageStr = typeof message === 'string' ? message : message.toString();

  if (data.type === 'terminal') {
    handleTerminalMessage(ws, messageStr);
  }
  // Status WebSocket doesn't receive messages from client
}

/**
 * Handle WebSocket close
 */
export function handleClose(ws: ServerWebSocket<WebSocketData>): void {
  const data = ws.data;

  if (data.type === 'status') {
    handleStatusClose(ws);
  } else if (data.type === 'logs') {
    handleLogsClose(ws);
  } else if (data.type === 'terminal') {
    handleTerminalClose(ws);
  }
}

export type { WebSocketData };
