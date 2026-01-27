import { Sun, Moon, Plus } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { useSessionStore } from '../../stores/sessionStore';
import SessionSwitcher from '../sessions/SessionSwitcher';
import PortButtons from './PortButtons';
import { useState } from 'react';
import CreateSessionModal from '../sessions/CreateSessionModal';

export default function Header() {
  const { theme, toggleTheme } = useUIStore();
  const { currentSession, sessions } = useSessionStore();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const current = sessions.find((s) => s.name === currentSession);

  return (
    <>
      <div className="flex items-center gap-2 px-3 py-2 bg-surface flex-shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-1.5 mr-1">
          <img
            src="https://claraverse.app/favicon.ico"
            alt="VibeManager"
            className="w-[22px] h-[22px] rounded-full"
          />
          <span className="text-[13px] font-bold text-text-primary tracking-tight hidden sm:block">
            VibeManager
          </span>
        </div>

        {/* Sessions button */}
        <button
          className="btn"
          onClick={() => setShowCreateModal(true)}
          title="New Session"
        >
          <Plus className="w-4 h-4" />
        </button>

        {/* Session switcher */}
        <SessionSwitcher />

        {/* Current session name */}
        {current && (
          <span className="flex-1 text-[12px] text-text-dim font-mono truncate min-w-[40px]">
            {current.projectPath}
          </span>
        )}

        {/* Port buttons */}
        <PortButtons />

        {/* Theme toggle */}
        <button
          className="btn"
          onClick={toggleTheme}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4" />
          ) : (
            <Moon className="w-4 h-4" />
          )}
        </button>
      </div>

      <CreateSessionModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />
    </>
  );
}
