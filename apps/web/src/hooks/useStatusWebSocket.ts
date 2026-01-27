import { useEffect, useRef } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import { useAuthStore } from '../stores/authStore';
import type { StatusUpdate } from '@vibemanager/shared';

export function useStatusWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { setSessions, setSystemStats, setPorts, setIsLoading } = useSessionStore();
  const token = useAuthStore((state) => state.token);

  useEffect(() => {
    function connect() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
      const ws = new WebSocket(`${protocol}//${host}/status${tokenParam}`);

      ws.onopen = () => {
        console.log('Status WebSocket connected');
        setIsLoading(false);
      };

      ws.onmessage = (event) => {
        try {
          const data: StatusUpdate = JSON.parse(event.data);
          if (data.type === 'status') {
            setSessions(data.sessions);
            setSystemStats(data.system);
            setPorts(data.ports);
          }
        } catch (error) {
          console.error('Error parsing status message:', error);
        }
      };

      ws.onclose = () => {
        console.log('Status WebSocket closed, reconnecting...');
        wsRef.current = null;
        // Reconnect after 2 seconds
        reconnectTimeoutRef.current = setTimeout(connect, 2000);
      };

      ws.onerror = (error) => {
        console.error('Status WebSocket error:', error);
      };

      wsRef.current = ws;
    }

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [setSessions, setSystemStats, setPorts, setIsLoading]);

  return wsRef.current;
}
