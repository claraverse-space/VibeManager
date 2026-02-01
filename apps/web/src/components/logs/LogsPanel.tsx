import { useEffect, useRef, useState } from 'react';
import { Trash2, Circle } from 'lucide-react';
import { useLogsWebSocket, type LogEntry, type LogLevel, type LogCategory } from '../../hooks/useLogsWebSocket';
import { cn } from '../../lib/utils';

const levelColors: Record<LogLevel, string> = {
  debug: 'text-text-dim',
  info: 'text-blue-400',
  warn: 'text-yellow-400',
  error: 'text-red-400',
};

const categoryColors: Record<LogCategory, string> = {
  task: 'bg-purple-500/20 text-purple-400',
  session: 'bg-green-500/20 text-green-400',
  llm: 'bg-blue-500/20 text-blue-400',
  activity: 'bg-yellow-500/20 text-yellow-400',
  system: 'bg-gray-500/20 text-gray-400',
};

function LogRow({ entry }: { entry: LogEntry }) {
  const time = new Date(entry.timestamp).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div className="flex items-start gap-2 py-1 px-2 hover:bg-surface/50 font-mono text-[11px]">
      <span className="text-text-dim shrink-0">{time}</span>
      <span className={cn('uppercase w-12 shrink-0', levelColors[entry.level])}>
        [{entry.level}]
      </span>
      <span className={cn('px-1.5 py-0.5 rounded text-[10px] shrink-0', categoryColors[entry.category])}>
        {entry.category}
      </span>
      <span className="text-text-primary flex-1 break-all">{entry.message}</span>
      {entry.data && (
        <span className="text-text-dim shrink-0 max-w-[200px] truncate" title={JSON.stringify(entry.data)}>
          {JSON.stringify(entry.data)}
        </span>
      )}
    </div>
  );
}

export default function LogsPanel() {
  const { logs, connected, clearLogs } = useLogsWebSocket();
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [levelFilter, setLevelFilter] = useState<LogLevel | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<LogCategory | 'all'>('all');

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // Detect manual scroll
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(isAtBottom);
  };

  const filteredLogs = logs.filter((log) => {
    if (levelFilter !== 'all' && log.level !== levelFilter) return false;
    if (categoryFilter !== 'all' && log.category !== categoryFilter) return false;
    return true;
  });

  return (
    <div className="flex flex-col h-full bg-bg border border-surface-3 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-surface-3 bg-surface">
        <div className="flex items-center gap-2">
          <Circle
            className={cn('w-2 h-2', connected ? 'fill-green-500 text-green-500' : 'fill-red-500 text-red-500')}
          />
          <span className="text-[13px] font-medium text-text-primary">Live Logs</span>
          <span className="text-[11px] text-text-dim">({filteredLogs.length})</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Level filter */}
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value as LogLevel | 'all')}
            className="text-[11px] bg-surface-2 border border-surface-3 rounded px-2 py-1 text-text-primary cursor-pointer focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="all">All Levels</option>
            <option value="debug">Debug</option>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
          </select>
          {/* Category filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as LogCategory | 'all')}
            className="text-[11px] bg-surface-2 border border-surface-3 rounded px-2 py-1 text-text-primary cursor-pointer focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="all">All Categories</option>
            <option value="task">Task</option>
            <option value="session">Session</option>
            <option value="llm">LLM</option>
            <option value="activity">Activity</option>
            <option value="system">System</option>
          </select>
          <button
            onClick={clearLogs}
            className="p-1 hover:bg-surface-2 rounded text-text-dim hover:text-text-primary transition-colors"
            title="Clear logs"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Logs */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden"
      >
        {filteredLogs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-text-dim text-[12px]">
            No logs yet...
          </div>
        ) : (
          filteredLogs.map((log, i) => <LogRow key={i} entry={log} />)
        )}
      </div>

      {/* Auto-scroll indicator */}
      {!autoScroll && (
        <button
          onClick={() => {
            setAutoScroll(true);
            if (containerRef.current) {
              containerRef.current.scrollTop = containerRef.current.scrollHeight;
            }
          }}
          className="absolute bottom-4 right-4 px-2 py-1 bg-accent text-white text-[11px] rounded shadow-lg"
        >
          Scroll to bottom
        </button>
      )}
    </div>
  );
}
