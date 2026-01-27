import { useCallback, useEffect, useRef } from 'react';
import { useTerminalStore } from '../stores/terminalStore';
import { useUIStore } from '../stores/uiStore';
import { useAuthStore } from '../stores/authStore';
import type { TerminalMessage } from '@vibemanager/shared';

interface UseTerminalWebSocketOptions {
  sessionName: string | null;
  cols?: number;
  rows?: number;
}

export function useTerminalWebSocket({ sessionName, cols = 120, rows = 30 }: UseTerminalWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const { terminal, setIsConnected, setConnectedSession } = useTerminalStore();
  const { setIsConnecting } = useUIStore();
  const token = useAuthStore((state) => state.token);

  // Send data to terminal
  const send = useCallback((data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'data', data }));
    }
  }, []);

  // Resize terminal
  const resize = useCallback((newCols: number, newRows: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'resize', cols: newCols, rows: newRows }));
    }
  }, []);

  // Connect/disconnect effect
  useEffect(() => {
    if (!sessionName || !terminal) {
      return;
    }

    setIsConnecting(true);
    setIsConnected(false);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
    const url = `${protocol}//${host}/ws?session=${encodeURIComponent(sessionName)}&cols=${cols}&rows=${rows}${tokenParam}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log(`Terminal WebSocket connected to ${sessionName}`);
    };

    ws.onmessage = (event) => {
      try {
        const message: TerminalMessage = JSON.parse(event.data);

        switch (message.type) {
          case 'attached':
            setIsConnected(true);
            setIsConnecting(false);
            setConnectedSession(sessionName);
            break;

          case 'data':
            terminal.write(message.data);
            break;

          case 'detached':
            setIsConnected(false);
            setConnectedSession(null);
            terminal.write(`\r\n\x1b[33m[Terminal detached: ${message.reason}]\x1b[0m\r\n`);
            break;
        }
      } catch (error) {
        console.error('Error parsing terminal message:', error);
      }
    };

    ws.onclose = () => {
      console.log('Terminal WebSocket closed');
      setIsConnected(false);
      setIsConnecting(false);
      setConnectedSession(null);
      wsRef.current = null;
    };

    ws.onerror = (error) => {
      console.error('Terminal WebSocket error:', error);
      setIsConnecting(false);
    };

    // Set up terminal input handler
    const inputDisposable = terminal.onData((data) => {
      send(data);
    });

    return () => {
      inputDisposable.dispose();
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
      wsRef.current = null;
    };
  }, [sessionName, terminal, cols, rows, send, setIsConnected, setIsConnecting, setConnectedSession]);

  return { send, resize, ws: wsRef.current };
}
