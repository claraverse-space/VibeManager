import { Play, Pause, Square, Trash2, CheckCircle, XCircle, Clock, Loader2, ListOrdered, X } from 'lucide-react';
import { useTasks } from '../../hooks/useTasks';
import { cn, formatRelativeTime } from '../../lib/utils';
import type { Task } from '@vibemanager/shared';

interface TaskCardProps {
  task: Task;
}

function getStatusIcon(status: Task['status']) {
  switch (status) {
    case 'pending':
      return <Clock className="w-4 h-4 text-text-dim" />;
    case 'queued':
      return <ListOrdered className="w-4 h-4 text-accent-purple" />;
    case 'running':
      return <Loader2 className="w-4 h-4 text-accent-blue animate-spin" />;
    case 'paused':
      return <Pause className="w-4 h-4 text-accent-yellow" />;
    case 'completed':
      return <CheckCircle className="w-4 h-4 text-accent-green" />;
    case 'failed':
      return <XCircle className="w-4 h-4 text-accent-red" />;
    case 'cancelled':
      return <Square className="w-4 h-4 text-text-dim" />;
  }
}

function getStatusText(status: Task['status']) {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'queued':
      return 'Queued';
    case 'running':
      return 'Running';
    case 'paused':
      return 'Paused';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    case 'cancelled':
      return 'Cancelled';
  }
}

function getRunnerTypeLabel(runnerType: Task['runnerType']) {
  switch (runnerType) {
    case 'ralph':
      return 'Ralph Loop';
    case 'simple':
      return 'Simple';
    case 'manual':
      return 'Manual';
  }
}

export default function TaskCard({ task }: TaskCardProps) {
  const { startTask, pauseTask, resumeTask, cancelTask, deleteTask, completeTask, queueTask, unqueueTask } = useTasks();

  const isActive = task.status === 'running' || task.status === 'paused';
  const canStart = task.status === 'pending';
  const canQueue = task.status === 'pending';
  const canUnqueue = task.status === 'queued';
  const canPause = task.status === 'running' && task.runnerType === 'ralph';
  const canResume = task.status === 'paused';
  const canCancel = isActive;
  const canComplete = task.status === 'running' && task.runnerType === 'manual';
  const canDelete = !isActive && task.status !== 'queued';

  const handleStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    startTask.mutate(task.id);
  };

  const handlePause = (e: React.MouseEvent) => {
    e.stopPropagation();
    pauseTask.mutate(task.id);
  };

  const handleResume = (e: React.MouseEvent) => {
    e.stopPropagation();
    resumeTask.mutate(task.id);
  };

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Cancel task "${task.name}"?`)) {
      cancelTask.mutate(
        { id: task.id },
        {
          onError: (error) => {
            // If task is stuck, offer force cancel
            if (error.message?.includes('not actually running') || error.message?.includes('not running')) {
              if (confirm(`Task appears stuck. Force cancel "${task.name}"?`)) {
                cancelTask.mutate({ id: task.id, force: true });
              }
            } else {
              alert(`Failed to cancel: ${error.message}`);
            }
          },
        }
      );
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Delete task "${task.name}"?`)) {
      deleteTask.mutate(task.id);
    }
  };

  const handleComplete = (e: React.MouseEvent) => {
    e.stopPropagation();
    completeTask.mutate({ id: task.id, result: 'Manually completed' });
  };

  const handleQueue = (e: React.MouseEvent) => {
    e.stopPropagation();
    queueTask.mutate(task.id);
  };

  const handleUnqueue = (e: React.MouseEvent) => {
    e.stopPropagation();
    unqueueTask.mutate(task.id);
  };

  const progressPercent = task.maxIterations > 0
    ? Math.round((task.currentIteration / task.maxIterations) * 100)
    : 0;

  return (
    <div
      className={cn(
        'card flex flex-col gap-2.5',
        task.status === 'failed' && 'border-accent-red/30',
        task.status === 'completed' && 'border-accent-green/30',
        task.status === 'queued' && 'border-purple-500/30'
      )}
    >
      {/* Header with status and name */}
      <div className="flex items-center gap-2">
        {getStatusIcon(task.status)}
        <span className="text-[15px] font-semibold text-text-primary truncate flex-1">
          {task.name}
        </span>
        <span className="text-[11px] text-text-dim">
          {getRunnerTypeLabel(task.runnerType)}
        </span>
      </div>

      {/* Prompt preview */}
      <div className="text-[12px] text-text-secondary line-clamp-2">
        {task.prompt}
      </div>

      {/* Progress bar and status (for ralph/simple runners) */}
      {task.runnerType !== 'manual' && isActive && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
              <div
                className="h-full bg-accent-blue transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="text-[11px] text-text-dim font-mono">
              {task.currentIteration}/{task.maxIterations}
            </span>
          </div>
          <div className="text-[11px] text-accent-blue bg-accent-blue/10 rounded px-2 py-1 truncate">
            {task.statusMessage || (task.status === 'paused' ? 'Paused' : `Iteration ${task.currentIteration} running...`)}
          </div>
        </div>
      )}

      {/* Status and metadata */}
      <div className="text-[11px] text-text-dim flex gap-3 flex-wrap">
        <span>{getStatusText(task.status)}</span>
        {task.status === 'queued' && task.queuePosition && (
          <span className="text-accent-purple">Position #{task.queuePosition}</span>
        )}
        {task.startedAt && (
          <span>Started {formatRelativeTime(task.startedAt)}</span>
        )}
        {task.completedAt && (
          <span>Ended {formatRelativeTime(task.completedAt)}</span>
        )}
      </div>

      {/* Error message */}
      {task.error && (
        <div className="text-[11px] text-accent-red bg-accent-red/10 rounded px-2 py-1 truncate">
          {task.error}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 mt-auto">
        {canStart && (
          <button
            className="btn btn-primary flex-1 flex items-center justify-center gap-1.5"
            onClick={handleStart}
            disabled={startTask.isPending}
          >
            <Play className="w-3.5 h-3.5" />
            Start
          </button>
        )}

        {canQueue && (
          <button
            className="btn btn-secondary flex-1 flex items-center justify-center gap-1.5"
            onClick={handleQueue}
            disabled={queueTask.isPending}
            title="Add to queue - will auto-start after current task"
          >
            <ListOrdered className="w-3.5 h-3.5" />
            Queue
          </button>
        )}

        {canUnqueue && (
          <button
            className="btn btn-secondary flex-1 flex items-center justify-center gap-1.5"
            onClick={handleUnqueue}
            disabled={unqueueTask.isPending}
            title="Remove from queue"
          >
            <X className="w-3.5 h-3.5" />
            Unqueue
          </button>
        )}

        {canPause && (
          <button
            className="btn btn-secondary flex-1 flex items-center justify-center gap-1.5"
            onClick={handlePause}
            disabled={pauseTask.isPending}
          >
            <Pause className="w-3.5 h-3.5" />
            Pause
          </button>
        )}

        {canResume && (
          <button
            className="btn btn-primary flex-1 flex items-center justify-center gap-1.5"
            onClick={handleResume}
            disabled={resumeTask.isPending}
          >
            <Play className="w-3.5 h-3.5" />
            Resume
          </button>
        )}

        {canComplete && (
          <button
            className="btn btn-success flex-1 flex items-center justify-center gap-1.5"
            onClick={handleComplete}
            disabled={completeTask.isPending}
          >
            <CheckCircle className="w-3.5 h-3.5" />
            Complete
          </button>
        )}

        {canCancel && (
          <button
            className="btn btn-danger flex-0 px-2.5"
            onClick={handleCancel}
            disabled={cancelTask.isPending}
            title="Cancel task"
          >
            <Square className="w-3.5 h-3.5" />
          </button>
        )}

        {canDelete && (
          <button
            className="btn btn-danger flex-0 px-2.5"
            onClick={handleDelete}
            disabled={deleteTask.isPending}
            title="Delete task"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
