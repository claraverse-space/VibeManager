import type { ServerWebSocket } from 'bun';
import { sessionService } from '../services/SessionService';
import { taskService } from '../services/TaskService';
import { systemMonitor, getListeningPorts } from '../services/SystemMonitor';
import { activityService } from '../services/ActivityService';
import { STATUS_UPDATE_INTERVAL } from '@vibemanager/shared';
import type { Session, SessionActivity } from '@vibemanager/shared';

// Track status WebSocket connections
const statusClients = new Set<ServerWebSocket<unknown>>();

// Interval handle
let statusInterval: Timer | null = null;

/**
 * Handle new status WebSocket connection
 */
export function handleStatusConnection(ws: ServerWebSocket<unknown>): void {
  statusClients.add(ws);

  // Start interval if not running
  if (!statusInterval) {
    startStatusBroadcast();
  }

  // Send immediate status update
  sendStatusUpdate(ws);
}

/**
 * Handle status WebSocket close
 */
export function handleStatusClose(ws: ServerWebSocket<unknown>): void {
  statusClients.delete(ws);

  // Stop interval if no clients
  if (statusClients.size === 0 && statusInterval) {
    clearInterval(statusInterval);
    statusInterval = null;
  }
}

/**
 * Start broadcasting status updates
 */
function startStatusBroadcast(): void {
  statusInterval = setInterval(async () => {
    await broadcastStatus();
  }, STATUS_UPDATE_INTERVAL);
}

/**
 * Get default idle activity state
 */
function getIdleActivity(): SessionActivity {
  return {
    lastOutputAt: 0,
    activityState: 'idle',
  };
}

type SessionWithAlive = Session & { alive: boolean };

/**
 * Enrich sessions with activity data
 */
function enrichSessionsWithActivity(
  sessions: SessionWithAlive[]
): Array<SessionWithAlive & { activity: SessionActivity }> {
  // Poll alive sessions for activity
  for (const session of sessions) {
    if (session.alive) {
      activityService.pollSession(session.name);
    }
  }

  // Return sessions with activity data
  return sessions.map(session => ({
    ...session,
    activity: session.alive
      ? activityService.getActivity(session.name)
      : getIdleActivity(),
  }));
}

/**
 * Broadcast status to all clients
 */
async function broadcastStatus(): Promise<void> {
  if (statusClients.size === 0) return;

  try {
    const [sessions, system, ports, tasks] = await Promise.all([
      sessionService.list(),
      Promise.resolve(systemMonitor.getStats()),
      Promise.resolve(getListeningPorts()),
      taskService.list(),
    ]);

    const sessionsWithActivity = enrichSessionsWithActivity(sessions);

    const message = JSON.stringify({
      type: 'status',
      sessions: sessionsWithActivity,
      system,
      ports,
      tasks,
    });

    for (const client of statusClients) {
      try {
        client.send(message);
      } catch {
        statusClients.delete(client);
      }
    }
  } catch (error) {
    console.error('Error broadcasting status:', error);
  }
}

/**
 * Send status update to single client
 */
async function sendStatusUpdate(ws: ServerWebSocket<unknown>): Promise<void> {
  try {
    const [sessions, system, ports, tasks] = await Promise.all([
      sessionService.list(),
      Promise.resolve(systemMonitor.getStats()),
      Promise.resolve(getListeningPorts()),
      taskService.list(),
    ]);

    const sessionsWithActivity = enrichSessionsWithActivity(sessions);

    ws.send(
      JSON.stringify({
        type: 'status',
        sessions: sessionsWithActivity,
        system,
        ports,
        tasks,
      })
    );
  } catch (error) {
    console.error('Error sending status:', error);
  }
}

/**
 * Get number of status clients
 */
export function getStatusClientCount(): number {
  return statusClients.size;
}
