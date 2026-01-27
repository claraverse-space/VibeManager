import { Play, Square, Trash2, RefreshCw } from 'lucide-react';
import { useSessionStore } from '../../stores/sessionStore';
import { useUIStore } from '../../stores/uiStore';
import { useSessions } from '../../hooks/useSessions';
import { cn, truncatePath, formatRelativeTime } from '../../lib/utils';
import ActivityIndicator from './ActivityIndicator';
import type { Session, SessionActivity } from '@vibemanager/shared';

interface SessionCardProps {
  session: Session & { alive: boolean; activity: SessionActivity };
}

export default function SessionCard({ session }: SessionCardProps) {
  const { setCurrentSession } = useSessionStore();
  const { setViewMode } = useUIStore();
  const { stop, revive, delete: deleteSession, isStopping, isReviving, isDeleting } =
    useSessions();

  const handleAttach = () => {
    setCurrentSession(session.name);
    setViewMode('terminal');
  };

  const handleStop = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await stop(session.name);
  };

  const handleRevive = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await revive(session.name);
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Delete session "${session.name}"?`)) {
      await deleteSession(session.name);
    }
  };

  return (
    <div
      className={cn(
        'card flex flex-col gap-2.5 cursor-pointer',
        !session.alive && 'opacity-60'
      )}
      onClick={handleAttach}
    >
      {/* Header with activity indicator and name */}
      <div className="flex items-center gap-2">
        <ActivityIndicator activity={session.activity} alive={session.alive} />
        <span className="text-[15px] font-semibold text-text-primary">
          {session.name}
        </span>
      </div>

      {/* Project path */}
      <div className="text-[11px] text-text-dim font-mono truncate">
        {truncatePath(session.projectPath)}
      </div>

      {/* Metadata */}
      <div className="text-[11px] text-text-dim flex gap-3">
        <span>{session.shell}</span>
        <span>{formatRelativeTime(session.lastAccessedAt)}</span>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 mt-auto">
        <button
          className="btn btn-primary flex-1 flex items-center justify-center gap-1.5"
          onClick={handleAttach}
        >
          <Play className="w-3.5 h-3.5" />
          Attach
        </button>

        {session.alive ? (
          <button
            className="btn btn-danger flex-0 px-2.5"
            onClick={handleStop}
            disabled={isStopping}
            title="Stop session"
          >
            <Square className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button
            className="btn btn-success flex-0 px-2.5"
            onClick={handleRevive}
            disabled={isReviving}
            title="Revive session"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          className="btn btn-danger flex-0 px-2.5"
          onClick={handleDelete}
          disabled={isDeleting}
          title="Delete session"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
