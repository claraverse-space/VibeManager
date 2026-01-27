import { useTerminalStore } from '../../stores/terminalStore';
import { useSessionStore } from '../../stores/sessionStore';
import { cn } from '../../lib/utils';

export default function StatusBar() {
  const { isConnected, connectedSession } = useTerminalStore();
  const { sessions } = useSessionStore();

  const aliveSessions = sessions.filter((s) => s.alive).length;
  const totalSessions = sessions.length;

  return (
    <div className="flex items-center gap-4 px-3 py-1 bg-surface text-[11px] font-mono text-text-dim flex-shrink-0">
      {/* Connection status */}
      <div className="flex items-center gap-1.5">
        <div
          className={cn(
            'w-2 h-2 rounded-full',
            isConnected ? 'bg-success' : 'bg-text-dim'
          )}
        />
        <span>
          {isConnected
            ? `Connected to ${connectedSession}`
            : 'Not connected'}
        </span>
      </div>

      {/* Session count */}
      <span>
        {aliveSessions}/{totalSessions} sessions
      </span>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Version */}
      <span className="opacity-50">v2.0.0</span>
    </div>
  );
}
