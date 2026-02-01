import { useState } from 'react';
import { X, Folder, ChevronRight, ChevronLeft } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useSessions } from '../../hooks/useSessions';
import { browseApi } from '../../lib/api';
import { cn } from '../../lib/utils';
import type { ShellType, DirectoryEntry } from '@vibemanager/shared';

interface CreateSessionModalProps {
  open: boolean;
  onClose: () => void;
}

export default function CreateSessionModal({ open, onClose }: CreateSessionModalProps) {
  const [name, setName] = useState('');
  const [projectPath, setProjectPath] = useState('');
  const [shell, setShell] = useState<ShellType | 'auto'>('auto');
  const [showBrowser, setShowBrowser] = useState(false);
  const [browserPath, setBrowserPath] = useState('');
  const [error, setError] = useState('');

  const { create, isCreating } = useSessions();

  // Folder browser query
  const { data: entries = [] } = useQuery({
    queryKey: ['browse', browserPath],
    queryFn: () => browseApi.list(browserPath || undefined),
    enabled: showBrowser,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (!projectPath.trim()) {
      setError('Project path is required');
      return;
    }

    try {
      await create({ name: name.trim(), projectPath: projectPath.trim(), shell });
      onClose();
      resetForm();
    } catch (err) {
      setError(String(err));
    }
  };

  const resetForm = () => {
    setName('');
    setProjectPath('');
    setShell('auto');
    setShowBrowser(false);
    setBrowserPath('');
    setError('');
  };

  const handleFolderSelect = (entry: DirectoryEntry) => {
    if (entry.isDirectory) {
      setBrowserPath(entry.path);
    }
  };

  const handleSelectPath = () => {
    setProjectPath(browserPath);
    // Auto-fill session name from folder name if empty
    if (!name.trim()) {
      const folderName = browserPath.split('/').filter(Boolean).pop() || '';
      setName(folderName);
    }
    setShowBrowser(false);
  };

  const handleGoUp = () => {
    const parts = browserPath.split('/').filter(Boolean);
    parts.pop();
    setBrowserPath('/' + parts.join('/'));
  };

  if (!open) return null;

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
            {showBrowser ? 'Select Project Folder' : 'New Session'}
          </h2>
          <button
            className="text-text-dim hover:text-text-primary transition-colors"
            onClick={onClose}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        {showBrowser ? (
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 px-4 py-2 bg-surface-2 text-[12px] font-mono">
              <button
                className="text-text-dim hover:text-text-primary"
                onClick={handleGoUp}
                disabled={!browserPath || browserPath === '/'}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="truncate text-text-dim">{browserPath || '~'}</span>
            </div>

            {/* Directory listing */}
            <div className="flex-1 overflow-y-auto">
              {entries.map((entry) => (
                <div
                  key={entry.path}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 cursor-pointer hover:bg-surface-2',
                    entry.isDirectory ? 'text-text-primary' : 'text-text-dim'
                  )}
                  onClick={() => handleFolderSelect(entry)}
                >
                  {entry.isDirectory ? (
                    <Folder className="w-4 h-4 text-accent" />
                  ) : (
                    <div className="w-4 h-4" />
                  )}
                  <span className="flex-1 truncate text-[13px]">{entry.name}</span>
                  {entry.isDirectory && (
                    <ChevronRight className="w-4 h-4 text-text-dim" />
                  )}
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-2 p-4 border-t border-surface-2">
              <button
                className="btn flex-1"
                onClick={() => setShowBrowser(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary flex-1"
                onClick={handleSelectPath}
              >
                Select This Folder
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-4 flex flex-col gap-4">
            {/* Name field */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] uppercase tracking-wider text-text-dim font-semibold">
                Session Name
              </label>
              <input
                type="text"
                className="input w-full py-2.5 px-3 bg-surface-2"
                placeholder="my-project"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>

            {/* Project path field */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] uppercase tracking-wider text-text-dim font-semibold">
                Project Path
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="input flex-1 py-2.5 px-3 bg-surface-2"
                  placeholder="/home/user/projects/my-project"
                  value={projectPath}
                  onChange={(e) => setProjectPath(e.target.value)}
                />
                <button
                  type="button"
                  className="btn px-3"
                  onClick={() => {
                    setBrowserPath(projectPath || '');
                    setShowBrowser(true);
                  }}
                >
                  <Folder className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Shell selector */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] uppercase tracking-wider text-text-dim font-semibold">
                Shell / Agent
              </label>
              <div className="flex gap-2">
                {(['auto', 'opencode', 'claude', 'kimi', 'bash'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={cn(
                      'btn flex-1 capitalize',
                      shell === s && 'btn-primary'
                    )}
                    onClick={() => setShell(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div className="text-[12px] text-danger bg-danger/10 px-3 py-2">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              className="btn btn-primary w-full py-2.5"
              disabled={isCreating}
            >
              {isCreating ? 'Creating...' : 'Create Session'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
