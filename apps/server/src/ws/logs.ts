import type { ServerWebSocket } from 'bun';
import { logService, type LogEntry } from '../services/LogService';

const clients = new Set<ServerWebSocket<unknown>>();

// Listen for new logs and broadcast to all clients
logService.on('log', (entry: LogEntry) => {
  const message = JSON.stringify({
    type: 'log',
    data: {
      ...entry,
      timestamp: entry.timestamp.toISOString(),
    },
  });

  for (const client of clients) {
    try {
      client.send(message);
    } catch {
      clients.delete(client);
    }
  }
});

export function handleLogsWebSocket(ws: ServerWebSocket<unknown>) {
  clients.add(ws);

  // Send recent logs on connect
  const recentLogs = logService.getRecent(50);
  ws.send(JSON.stringify({
    type: 'initial',
    data: recentLogs.map(entry => ({
      ...entry,
      timestamp: entry.timestamp.toISOString(),
    })),
  }));
}

export function handleLogsClose(ws: ServerWebSocket<unknown>) {
  clients.delete(ws);
}
