import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useTerminalStore } from '../../stores/terminalStore';
import { useSessionStore } from '../../stores/sessionStore';
import { useUIStore } from '../../stores/uiStore';
import { useTerminalWebSocket } from '../../hooks/useTerminalWebSocket';
import ConnectingOverlay from './ConnectingOverlay';
import VirtualKeys from './VirtualKeys';

export default function TerminalView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  const { terminal, setTerminal, isConnected } = useTerminalStore();
  const { currentSession } = useSessionStore();
  const { isConnecting, theme } = useUIStore();

  // Get terminal dimensions from fit addon
  const cols = fitAddonRef.current?.proposeDimensions()?.cols ?? 120;
  const rows = fitAddonRef.current?.proposeDimensions()?.rows ?? 30;

  // WebSocket connection
  const { resize } = useTerminalWebSocket({
    sessionName: currentSession,
    cols,
    rows,
  });

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current || termRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      theme: {
        background: theme === 'dark' ? '#09090b' : '#f8f8fa',
        foreground: theme === 'dark' ? '#ececf1' : '#1a1a2e',
        cursor: theme === 'dark' ? '#ececf1' : '#1a1a2e',
        cursorAccent: theme === 'dark' ? '#09090b' : '#f8f8fa',
        selectionBackground: theme === 'dark' ? 'rgba(99, 102, 241, 0.3)' : 'rgba(79, 70, 229, 0.3)',
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);

    // Initial fit
    setTimeout(() => {
      fitAddon.fit();
    }, 0);

    termRef.current = term;
    fitAddonRef.current = fitAddon;
    setTerminal(term);

    // Handle window resize
    const handleResize = () => {
      fitAddon.fit();
      const dims = fitAddon.proposeDimensions();
      if (dims) {
        resize(dims.cols, dims.rows);
      }
    };

    window.addEventListener('resize', handleResize);

    // Resize observer for container
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(containerRef.current);

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
      setTerminal(null);
    };
  }, [setTerminal, resize, theme]);

  // Update theme when it changes
  useEffect(() => {
    if (!terminal) return;

    terminal.options.theme = {
      background: theme === 'dark' ? '#09090b' : '#f8f8fa',
      foreground: theme === 'dark' ? '#ececf1' : '#1a1a2e',
      cursor: theme === 'dark' ? '#ececf1' : '#1a1a2e',
      cursorAccent: theme === 'dark' ? '#09090b' : '#f8f8fa',
      selectionBackground: theme === 'dark' ? 'rgba(99, 102, 241, 0.3)' : 'rgba(79, 70, 229, 0.3)',
    };
  }, [theme, terminal]);

  return (
    <div className="flex-1 flex flex-col min-h-0 h-full bg-bg relative">
      {/* Terminal container */}
      <div ref={containerRef} className="flex-1 min-h-0 h-full p-1" />

      {/* Connecting overlay */}
      {(isConnecting || (!isConnected && currentSession)) && (
        <ConnectingOverlay sessionName={currentSession} />
      )}

      {/* Virtual keyboard for mobile */}
      <VirtualKeys />
    </div>
  );
}
