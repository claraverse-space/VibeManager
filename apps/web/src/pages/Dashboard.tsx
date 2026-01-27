import { Plus, Layers, Play, Square, Clock } from 'lucide-react';
import { useState } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import SessionCard from '../components/sessions/SessionCard';
import CreateSessionModal from '../components/sessions/CreateSessionModal';
import SystemMonitor from '../components/system/SystemMonitor';
import { formatUptime } from '../lib/utils';

export default function Dashboard() {
  const { sessions, systemStats } = useSessionStore();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const aliveSessions = sessions.filter((s) => s.alive);
  const deadSessions = sessions.filter((s) => !s.alive);

  return (
    <div className="flex-1 flex flex-col overflow-y-auto p-4 gap-4 scrollbar-touch">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <h1 className="text-[18px] font-semibold text-text-primary">Dashboard</h1>
        <button
          className="btn btn-primary flex items-center gap-1.5"
          onClick={() => setShowCreateModal(true)}
        >
          <Plus className="w-4 h-4" />
          New Project
        </button>
      </div>

      {/* Stats bar */}
      <div className="flex gap-4 flex-shrink-0 flex-wrap">
        <div className="stat-item running flex items-center gap-2 px-4 py-2.5 bg-surface flex-1 min-w-[100px]">
          <Play className="w-4 h-4 text-success" />
          <div>
            <div className="text-[22px] font-bold font-mono text-success">
              {aliveSessions.length}
            </div>
            <div className="text-[11px] text-text-dim uppercase tracking-wider">
              Running
            </div>
          </div>
        </div>

        <div className="stat-item stopped flex items-center gap-2 px-4 py-2.5 bg-surface flex-1 min-w-[100px]">
          <Square className="w-4 h-4 text-text-dim" />
          <div>
            <div className="text-[22px] font-bold font-mono text-text-dim">
              {deadSessions.length}
            </div>
            <div className="text-[11px] text-text-dim uppercase tracking-wider">
              Stopped
            </div>
          </div>
        </div>

        <div className="stat-item total flex items-center gap-2 px-4 py-2.5 bg-surface flex-1 min-w-[100px]">
          <Layers className="w-4 h-4 text-accent" />
          <div>
            <div className="text-[22px] font-bold font-mono text-accent">
              {sessions.length}
            </div>
            <div className="text-[11px] text-text-dim uppercase tracking-wider">
              Total
            </div>
          </div>
        </div>

        {systemStats && (
          <div className="stat-item uptime flex items-center gap-2 px-4 py-2.5 bg-surface flex-1 min-w-[100px]">
            <Clock className="w-4 h-4 text-warn" />
            <div>
              <div className="text-[16px] font-bold font-mono text-warn">
                {formatUptime(systemStats.uptime)}
              </div>
              <div className="text-[11px] text-text-dim uppercase tracking-wider">
                Uptime
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sessions grid */}
      {sessions.length > 0 ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
          {sessions.map((session) => (
            <SessionCard key={session.id} session={session} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-text-dim text-center">
          <div className="text-[40px] opacity-30">📂</div>
          <p className="text-[14px]">No sessions yet</p>
          <p className="text-[12px] opacity-60">
            Create a new session to get started with your AI coding agent
          </p>
        </div>
      )}

      {/* System monitor */}
      {systemStats && <SystemMonitor />}

      <CreateSessionModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />
    </div>
  );
}
