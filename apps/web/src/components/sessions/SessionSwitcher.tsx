import { useSessionStore } from '../../stores/sessionStore';
import { useUIStore } from '../../stores/uiStore';
import { cn } from '../../lib/utils';

export default function SessionSwitcher() {
  const { sessions, currentSession, setCurrentSession } = useSessionStore();
  const { setViewMode } = useUIStore();

  const handleSessionClick = (name: string) => {
    setCurrentSession(name);
    setViewMode('terminal');
  };

  if (sessions.length === 0) return null;

  return (
    <div className="flex items-center gap-1 overflow-x-auto max-w-[40%] flex-shrink scrollbar-none">
      {sessions.map((session, index) => (
        <button
          key={session.id}
          className={cn(
            'ss-btn bg-surface-2 text-text-dim border-none py-1 px-2 text-[11px] font-semibold cursor-pointer whitespace-nowrap flex-shrink-0 flex items-center gap-1 transition-all max-w-[120px] overflow-hidden',
            currentSession === session.name && 'bg-accent text-white',
            !session.alive && 'opacity-40'
          )}
          onClick={() => handleSessionClick(session.name)}
          data-index={index + 1}
        >
          <span
            className={cn(
              'w-1.5 h-1.5 rounded-full flex-shrink-0',
              session.alive ? 'bg-success' : 'bg-danger',
              currentSession === session.name && session.alive && 'bg-success'
            )}
          />
          <span className="truncate ss-name">{session.name}</span>
        </button>
      ))}
    </div>
  );
}
