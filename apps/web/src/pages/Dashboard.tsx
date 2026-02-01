import { Plus, Layers, Play, Square, Clock, ListTodo, Settings, ScrollText, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import { useTaskStore } from '../stores/taskStore';
import { useUIStore } from '../stores/uiStore';
import SessionCard from '../components/sessions/SessionCard';
import CreateSessionModal from '../components/sessions/CreateSessionModal';
import { TaskCard, CreateTaskModal, TaskDetailsModal } from '../components/tasks';
import type { Task } from '@vibemanager/shared';
import { VerifierSettingsModal } from '../components/settings';
import SystemMonitor from '../components/system/SystemMonitor';
import LogsPanel from '../components/logs/LogsPanel';
import { formatUptime } from '../lib/utils';

export default function Dashboard() {
  const { sessions, systemStats } = useSessionStore();
  const { tasks } = useTaskStore();
  const { showToast } = useUIStore();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [showVerifierSettings, setShowVerifierSettings] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showLogs, setShowLogs] = useState(false);

  const aliveSessions = sessions.filter((s) => s.alive);
  const deadSessions = sessions.filter((s) => !s.alive);

  const handleNewTask = () => {
    if (aliveSessions.length === 0) {
      showToast('Create a session first to add tasks', 'warning');
      return;
    }
    setShowCreateTaskModal(true);
  };
  const runningTasks = tasks.filter((t) => t.status === 'running' || t.status === 'paused');
  const pendingTasks = tasks.filter((t) => t.status === 'pending');

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

        <div className="stat-item tasks flex items-center gap-2 px-4 py-2.5 bg-surface flex-1 min-w-[100px]">
          <ListTodo className="w-4 h-4 text-accent-blue" />
          <div>
            <div className="text-[22px] font-bold font-mono text-accent-blue">
              {runningTasks.length}
            </div>
            <div className="text-[11px] text-text-dim uppercase tracking-wider">
              Tasks
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

      {/* Tasks section */}
      {(tasks.length > 0 || aliveSessions.length > 0) && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-text-primary flex items-center gap-2">
              <ListTodo className="w-4 h-4" />
              Tasks
              {runningTasks.length > 0 && (
                <span className="text-[11px] bg-accent-blue/20 text-accent-blue px-2 py-0.5 rounded">
                  {runningTasks.length} running
                </span>
              )}
            </h2>
            <div className="flex gap-2">
              <button
                className="btn flex items-center gap-1.5 text-[12px] px-2.5"
                onClick={() => setShowVerifierSettings(true)}
                title="Task verifier settings"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
              <button
                className="btn btn-secondary flex items-center gap-1.5 text-[12px]"
                onClick={handleNewTask}
                title="Create a new task"
              >
                <Plus className="w-3.5 h-3.5" />
                New Task
              </button>
            </div>
          </div>

          {tasks.length > 0 ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
              {tasks.map((task) => (
                <div key={task.id} onClick={() => setSelectedTask(task)} className="cursor-pointer">
                  <TaskCard task={task} />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[12px] text-text-dim bg-surface px-4 py-3 rounded">
              No tasks yet. Create a task to automate work in your sessions.
            </div>
          )}
        </div>
      )}

      {/* System monitor */}
      {systemStats && <SystemMonitor />}

      {/* Logs panel */}
      <div className="flex flex-col gap-2">
        <button
          onClick={() => setShowLogs(!showLogs)}
          className="flex items-center gap-2 text-[13px] text-text-secondary hover:text-text-primary transition-colors"
        >
          <ScrollText className="w-4 h-4" />
          <span>Live Logs</span>
          {showLogs ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>
        {showLogs && (
          <div className="h-[300px] relative">
            <LogsPanel />
          </div>
        )}
      </div>

      <CreateSessionModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />

      <CreateTaskModal
        open={showCreateTaskModal}
        onClose={() => setShowCreateTaskModal(false)}
      />

      <VerifierSettingsModal
        open={showVerifierSettings}
        onClose={() => setShowVerifierSettings(false)}
      />

      <TaskDetailsModal
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
      />
    </div>
  );
}
