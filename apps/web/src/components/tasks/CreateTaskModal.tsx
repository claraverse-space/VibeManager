import { useState } from 'react';
import { X, Plus, Loader2 } from 'lucide-react';
import { useTasks } from '../../hooks/useTasks';
import { useSessionStore } from '../../stores/sessionStore';
import { cn } from '../../lib/utils';
import type { RunnerType, ShellType } from '@vibemanager/shared';

interface CreateTaskModalProps {
  open: boolean;
  onClose: () => void;
  sessionId?: string;
}

export default function CreateTaskModal({ open, onClose, sessionId: propSessionId }: CreateTaskModalProps) {
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [runnerType, setRunnerType] = useState<RunnerType>('ralph');
  const [maxIterations, setMaxIterations] = useState(10);
  const [verificationPrompt, setVerificationPrompt] = useState('');
  const [autoStart, setAutoStart] = useState(false);
  const [error, setError] = useState('');

  // Fresh session options
  const [useFreshSession, setUseFreshSession] = useState(false);
  const [freshSessionName, setFreshSessionName] = useState('');
  const [freshProjectPath, setFreshProjectPath] = useState('');
  const [freshShell, setFreshShell] = useState<ShellType>('claude');
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [creationStatus, setCreationStatus] = useState('');

  const { createTask, createTaskWithFreshSession } = useTasks();
  const { sessions, currentSession } = useSessionStore();
  const [selectedSessionId, setSelectedSessionId] = useState(propSessionId || '');

  // Get session ID - use prop, then selected, then current session
  const sessionId = propSessionId || selectedSessionId ||
    sessions.find(s => s.name === currentSession)?.id || '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (!prompt.trim()) {
      setError('Prompt is required');
      return;
    }

    // Handle fresh session creation
    if (useFreshSession) {
      if (!freshSessionName.trim()) {
        setError('Session name is required for fresh session');
        return;
      }
      if (!freshProjectPath.trim()) {
        setError('Project path is required for fresh session');
        return;
      }

      setIsCreatingSession(true);
      setCreationStatus('Creating fresh session...');

      try {
        await createTaskWithFreshSession.mutateAsync({
          task: {
            name: name.trim(),
            prompt: prompt.trim(),
            runnerType,
            maxIterations,
            verificationPrompt: verificationPrompt.trim() || null,
          },
          session: {
            name: freshSessionName.trim(),
            projectPath: freshProjectPath.trim(),
            shell: freshShell,
          },
        });
        onClose();
        resetForm();
      } catch (err) {
        setError(String(err));
      } finally {
        setIsCreatingSession(false);
        setCreationStatus('');
      }
      return;
    }

    // Regular task creation with existing session
    if (!sessionId) {
      setError('Please select a session');
      return;
    }

    try {
      await createTask.mutateAsync({
        sessionId,
        name: name.trim(),
        prompt: prompt.trim(),
        runnerType,
        maxIterations,
        verificationPrompt: verificationPrompt.trim() || null,
        autoStart,
      });
      onClose();
      resetForm();
    } catch (err) {
      setError(String(err));
    }
  };

  const resetForm = () => {
    setName('');
    setPrompt('');
    setRunnerType('ralph');
    setMaxIterations(10);
    setVerificationPrompt('');
    setAutoStart(false);
    setError('');
    setUseFreshSession(false);
    setFreshSessionName('');
    setFreshProjectPath('');
    setFreshShell('claude');
    setCreationStatus('');
    if (!propSessionId) {
      setSelectedSessionId('');
    }
  };

  if (!open) return null;

  const aliveSessions = sessions.filter(s => s.alive);

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-[2px] flex items-center justify-center z-[1000] p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface w-full max-w-md max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-2">
          <h2 className="text-[15px] font-semibold text-text-primary">
            New Task
          </h2>
          <button
            className="text-text-dim hover:text-text-primary transition-colors"
            onClick={onClose}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 flex flex-col gap-4 overflow-y-auto">
          {/* Fresh Session Toggle */}
          {!propSessionId && (
            <div className="flex flex-col gap-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  className={cn(
                    'btn flex-1 flex items-center justify-center gap-2',
                    !useFreshSession && 'btn-primary'
                  )}
                  onClick={() => setUseFreshSession(false)}
                >
                  Use Existing Session
                </button>
                <button
                  type="button"
                  className={cn(
                    'btn flex-1 flex items-center justify-center gap-2',
                    useFreshSession && 'btn-primary'
                  )}
                  onClick={() => setUseFreshSession(true)}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Fresh Session
                </button>
              </div>
              {useFreshSession && (
                <div className="text-[11px] text-accent-blue bg-accent-blue/10 px-3 py-2 rounded">
                  A new session will be created and Claude/OpenCode will be given time to fully load before starting the task.
                </div>
              )}
            </div>
          )}

          {/* Existing Session Selector */}
          {!propSessionId && !useFreshSession && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] uppercase tracking-wider text-text-dim font-semibold">
                Session
              </label>
              <select
                className="input w-full py-2.5 px-3 bg-surface-2"
                value={selectedSessionId}
                onChange={(e) => setSelectedSessionId(e.target.value)}
              >
                <option value="">Select a session...</option>
                {aliveSessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {aliveSessions.length === 0 && (
                <span className="text-[11px] text-warn">
                  No active sessions. Use "Fresh Session" to create one.
                </span>
              )}
            </div>
          )}

          {/* Fresh Session Fields */}
          {!propSessionId && useFreshSession && (
            <>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] uppercase tracking-wider text-text-dim font-semibold">
                  New Session Name
                </label>
                <input
                  type="text"
                  className="input w-full py-2.5 px-3 bg-surface-2"
                  placeholder="my-new-session"
                  value={freshSessionName}
                  onChange={(e) => setFreshSessionName(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] uppercase tracking-wider text-text-dim font-semibold">
                  Project Path
                </label>
                <input
                  type="text"
                  className="input w-full py-2.5 px-3 bg-surface-2"
                  placeholder="/home/user/my-project"
                  value={freshProjectPath}
                  onChange={(e) => setFreshProjectPath(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] uppercase tracking-wider text-text-dim font-semibold">
                  Shell / Agent
                </label>
                <div className="flex gap-2">
                  {(['claude', 'opencode', 'bash'] as const).map((shell) => (
                    <button
                      key={shell}
                      type="button"
                      className={cn(
                        'btn flex-1 capitalize',
                        freshShell === shell && 'btn-primary'
                      )}
                      onClick={() => setFreshShell(shell as ShellType)}
                    >
                      {shell === 'opencode' ? 'OpenCode' : shell}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Name field */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] uppercase tracking-wider text-text-dim font-semibold">
              Task Name
            </label>
            <input
              type="text"
              className="input w-full py-2.5 px-3 bg-surface-2"
              placeholder="Fix login bug"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          {/* Prompt field */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] uppercase tracking-wider text-text-dim font-semibold">
              Prompt
            </label>
            <textarea
              className="input w-full py-2.5 px-3 bg-surface-2 min-h-[100px] resize-y"
              placeholder="The login form is not validating email addresses correctly..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>

          {/* Runner type selector */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] uppercase tracking-wider text-text-dim font-semibold">
              Runner Type
            </label>
            <div className="flex gap-2">
              {(['ralph', 'simple', 'manual'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  className={cn(
                    'btn flex-1 capitalize',
                    runnerType === type && 'btn-primary'
                  )}
                  onClick={() => setRunnerType(type)}
                >
                  {type === 'ralph' ? 'Ralph Loop' : type}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-text-dim">
              {runnerType === 'ralph' && 'Automated loop with LLM verification'}
              {runnerType === 'simple' && 'Single execution, no verification'}
              {runnerType === 'manual' && 'Task tracking only, manual control'}
            </span>
          </div>

          {/* Max iterations (only for ralph/simple) */}
          {runnerType !== 'manual' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] uppercase tracking-wider text-text-dim font-semibold">
                Max Iterations
              </label>
              <input
                type="number"
                className="input w-full py-2.5 px-3 bg-surface-2"
                min={1}
                max={100}
                value={maxIterations}
                onChange={(e) => setMaxIterations(parseInt(e.target.value) || 10)}
              />
            </div>
          )}

          {/* Verification prompt (only for ralph) */}
          {runnerType === 'ralph' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] uppercase tracking-wider text-text-dim font-semibold">
                Verification Criteria (Optional)
              </label>
              <textarea
                className="input w-full py-2.5 px-3 bg-surface-2 min-h-[60px] resize-y"
                placeholder="The task is complete when tests pass and no TypeScript errors..."
                value={verificationPrompt}
                onChange={(e) => setVerificationPrompt(e.target.value)}
              />
            </div>
          )}

          {/* Auto-start checkbox (only for existing sessions) */}
          {!useFreshSession && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 rounded border-surface-2 bg-surface-2"
                checked={autoStart}
                onChange={(e) => setAutoStart(e.target.checked)}
              />
              <span className="text-[13px] text-text-secondary">
                Start task immediately
              </span>
            </label>
          )}

          {/* Fresh session info */}
          {useFreshSession && (
            <div className="text-[11px] text-text-dim bg-surface-2 px-3 py-2 rounded">
              <strong>What happens:</strong>
              <ol className="list-decimal ml-4 mt-1 space-y-0.5">
                <li>New session will be created</li>
                <li>Wait for {freshShell === 'bash' ? 'shell' : freshShell} to fully load (~10-15s)</li>
                <li>Task will auto-start once ready</li>
              </ol>
            </div>
          )}

          {/* Creation status */}
          {isCreatingSession && creationStatus && (
            <div className="flex items-center gap-2 text-[12px] text-accent bg-accent/10 px-3 py-2 rounded">
              <Loader2 className="w-4 h-4 animate-spin" />
              {creationStatus}
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="text-[12px] text-danger bg-danger/10 px-3 py-2">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            className="btn btn-primary w-full py-2.5 flex items-center justify-center gap-2"
            disabled={createTask.isPending || createTaskWithFreshSession.isPending || isCreatingSession}
          >
            {(createTask.isPending || createTaskWithFreshSession.isPending || isCreatingSession) ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {useFreshSession ? 'Creating Session & Task...' : 'Creating...'}
              </>
            ) : (
              useFreshSession ? 'Create Session & Start Task' : 'Create Task'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
