import { useState, useEffect } from 'react';
import { ArrowDownCircle, RefreshCw, Check, X } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';

interface VersionInfo {
  current: string;
  latest: string | null;
  updateAvailable: boolean;
  lastChecked: string | null;
}

type UpdateState = 'idle' | 'checking' | 'updating' | 'success' | 'error';

export default function UpdateIndicator() {
  const token = useAuthStore((s) => s.token);
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [updateState, setUpdateState] = useState<UpdateState>('idle');
  const [updateMessage, setUpdateMessage] = useState('');

  const getHeaders = (): HeadersInit => {
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  };

  // Check for updates on mount and periodically
  useEffect(() => {
    checkVersion();
    const interval = setInterval(checkVersion, 60 * 60 * 1000); // Check every hour
    return () => clearInterval(interval);
  }, [token]);

  const checkVersion = async () => {
    try {
      const res = await fetch('/api/system/version', { headers: getHeaders() });
      const data = await res.json();
      if (data.success) {
        setVersionInfo(data.data);
      }
    } catch (error) {
      console.error('Failed to check version:', error);
    }
  };

  const handleUpdate = async () => {
    setUpdateState('updating');
    setUpdateMessage('Updating...');

    try {
      const res = await fetch('/api/system/update', {
        method: 'POST',
        headers: getHeaders(),
      });
      const data = await res.json();

      if (data.success) {
        setUpdateState('success');
        setUpdateMessage(data.data.message);

        if (data.data.needsRestart) {
          setUpdateMessage(data.data.message + ' - Restarting server...');
          // Wait for server to restart, then reload
          setTimeout(() => {
            window.location.reload();
          }, 5000);
        }
      } else {
        setUpdateState('error');
        setUpdateMessage(data.error || 'Update failed');
      }
    } catch (error) {
      setUpdateState('error');
      setUpdateMessage('Failed to connect to server');
    }
  };

  // Don't show anything if no update available
  if (!versionInfo?.updateAvailable) {
    return null;
  }

  return (
    <>
      {/* Update badge/button */}
      <button
        onClick={() => setShowDialog(true)}
        className="relative flex items-center gap-1 px-2 py-1 text-[11px] bg-accent/20 text-accent rounded hover:bg-accent/30 transition-colors"
        title={`Update available: v${versionInfo.latest}`}
      >
        <ArrowDownCircle className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Update</span>
        <span className="absolute -top-1 -right-1 w-2 h-2 bg-accent rounded-full animate-pulse" />
      </button>

      {/* Update dialog */}
      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-surface rounded-lg shadow-xl p-5 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-text-primary">
                Update Available
              </h2>
              <button
                onClick={() => setShowDialog(false)}
                className="text-text-dim hover:text-text-primary"
                disabled={updateState === 'updating'}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-text-dim">Current version:</span>
                <span className="font-mono text-text-primary">v{versionInfo.current}</span>
              </div>
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-text-dim">Latest version:</span>
                <span className="font-mono text-accent">v{versionInfo.latest}</span>
              </div>

              {updateState !== 'idle' && (
                <div
                  className={`p-3 rounded text-[13px] ${
                    updateState === 'error'
                      ? 'bg-red-500/10 text-red-400'
                      : updateState === 'success'
                        ? 'bg-green-500/10 text-green-400'
                        : 'bg-accent/10 text-accent'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {updateState === 'updating' && (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    )}
                    {updateState === 'success' && <Check className="w-4 h-4" />}
                    {updateState === 'error' && <X className="w-4 h-4" />}
                    <span>{updateMessage}</span>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowDialog(false)}
                  className="flex-1 px-4 py-2 text-[13px] text-text-dim hover:text-text-primary border border-border rounded transition-colors"
                  disabled={updateState === 'updating'}
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdate}
                  disabled={updateState === 'updating' || updateState === 'success'}
                  className="flex-1 px-4 py-2 text-[13px] bg-accent text-white rounded hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {updateState === 'updating' ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Updating...
                    </>
                  ) : updateState === 'success' ? (
                    <>
                      <Check className="w-4 h-4" />
                      Updated!
                    </>
                  ) : (
                    <>
                      <ArrowDownCircle className="w-4 h-4" />
                      Update Now
                    </>
                  )}
                </button>
              </div>

              <p className="text-[11px] text-text-dim text-center">
                The server will restart automatically after updating.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
