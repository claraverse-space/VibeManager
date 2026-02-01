import { X, CheckCircle, XCircle, Square, Clock } from 'lucide-react';
import { formatRelativeTime } from '../../lib/utils';
import type { Task } from '@vibemanager/shared';

interface TaskDetailsModalProps {
  task: Task | null;
  onClose: () => void;
}

function getStatusIcon(status: Task['status']) {
  switch (status) {
    case 'completed':
      return <CheckCircle className="w-5 h-5 text-accent-green" />;
    case 'failed':
      return <XCircle className="w-5 h-5 text-accent-red" />;
    case 'cancelled':
      return <Square className="w-5 h-5 text-text-dim" />;
    default:
      return <Clock className="w-5 h-5 text-text-dim" />;
  }
}

export default function TaskDetailsModal({ task, onClose }: TaskDetailsModalProps) {
  if (!task) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-[2px] flex items-center justify-center z-[1000] p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-2">
          <div className="flex items-center gap-2">
            {getStatusIcon(task.status)}
            <h2 className="text-[15px] font-semibold text-text-primary">
              {task.name}
            </h2>
          </div>
          <button
            className="text-text-dim hover:text-text-primary transition-colors"
            onClick={onClose}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {/* Status info */}
          <div className="flex gap-4 text-[12px] text-text-dim flex-wrap">
            <span>Status: <span className="text-text-primary capitalize">{task.status}</span></span>
            <span>Iterations: {task.currentIteration}/{task.maxIterations}</span>
            {task.startedAt && <span>Started: {formatRelativeTime(task.startedAt)}</span>}
            {task.completedAt && <span>Ended: {formatRelativeTime(task.completedAt)}</span>}
          </div>

          {/* Original prompt */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] uppercase tracking-wider text-text-dim font-semibold">
              Original Prompt
            </label>
            <div className="bg-surface-2 rounded p-3 text-[13px] text-text-secondary whitespace-pre-wrap">
              {task.prompt}
            </div>
          </div>

          {/* Error message */}
          {task.error && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] uppercase tracking-wider text-accent-red font-semibold">
                Error
              </label>
              <div className="bg-accent-red/10 text-accent-red rounded p-3 text-[13px] whitespace-pre-wrap">
                {task.error}
              </div>
            </div>
          )}

          {/* Last verification result */}
          {task.lastVerificationResult && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] uppercase tracking-wider text-text-dim font-semibold">
                Last Verification
              </label>
              <div className="bg-surface-2 rounded p-3 text-[13px] text-text-secondary whitespace-pre-wrap font-mono">
                {(() => {
                  try {
                    const result = JSON.parse(task.lastVerificationResult);
                    return `Passed: ${result.passed}\nFeedback: ${result.feedback}\nConfidence: ${result.confidence}`;
                  } catch {
                    return task.lastVerificationResult;
                  }
                })()}
              </div>
            </div>
          )}

          {/* Result/Output */}
          {task.result && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] uppercase tracking-wider text-text-dim font-semibold">
                Terminal Output (Last captured)
              </label>
              <div className="bg-black/50 rounded p-3 text-[12px] text-green-400 whitespace-pre-wrap font-mono max-h-[300px] overflow-y-auto">
                {task.result}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end p-4 border-t border-surface-2">
          <button className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
