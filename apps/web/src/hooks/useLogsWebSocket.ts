import { useEffect, useState, useRef, useCallback } from 'react';
import { useAuthStore } from '../stores/authStore';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogCategory = 'task' | 'session' | 'llm' | 'activity' | 'system';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
  data?: Record<string, unknown>;
}

export function useLogsWebSocket() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const token = useAuthStore((state) => state.token);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  useEffect(() => {
    if (!token) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const port = import.meta.env.DEV ? '3131' : window.location.port;
    const wsUrl = `${protocol}//${host}:${port}/logs?token=${encodeURIComponent(token)}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'initial') {
          setLogs(message.data);
        } else if (message.type === 'log') {
          setLogs((prev) => [...prev.slice(-499), message.data]);
        }
      } catch (e) {
        console.error('Failed to parse log message:', e);
      }
    };

    ws.onclose = () => {
      setConnected(false);
    };

    ws.onerror = () => {
      setConnected(false);
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [token]);

  return { logs, connected, clearLogs };
}
