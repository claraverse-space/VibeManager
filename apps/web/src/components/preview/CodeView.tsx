import { useCurrentSession } from '../../stores/sessionStore';
import { useEffect, useState } from 'react';
import { useAuthStore } from '../../stores/authStore';

type CodeServerStatus = 'checking' | 'running' | 'stopped' | 'not-installed' | 'starting';

export default function CodeView() {
  const currentSession = useCurrentSession();
  const token = useAuthStore((s) => s.token);
  const [status, setStatus] = useState<CodeServerStatus>('checking');
  const [codeServerPort, setCodeServerPort] = useState<number | null>(null);

  const checkCodeServer = async () => {
    try {
      const res = await fetch('/api/code/status', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (data.data?.running === true) {
        setStatus('running');
        setCodeServerPort(data.data.port);
      } else if (data.data?.installed === false) {
        setStatus('not-installed');
      } else {
        setStatus('stopped');
      }
    } catch {
      setStatus('stopped');
    }
  };

  useEffect(() => {
    checkCodeServer();
    const interval = setInterval(checkCodeServer, 5000);
    return () => clearInterval(interval);
  }, [token]);

  const handleStart = async () => {
    setStatus('starting');
    try {
      const res = await fetch('/api/code/start', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (data.success) {
        // Wait a bit for code-server to fully start
        setTimeout(checkCodeServer, 2000);
      } else {
        setStatus('stopped');
      }
    } catch {
      setStatus('stopped');
    }
  };

  if (!currentSession) {
    return (
      <div className="flex-1 h-full flex items-center justify-center flex-col gap-2 text-text-dim text-[13px]">
        <div className="text-[40px] opacity-30">📝</div>
        <p>Select a session to open in code editor</p>
        <p className="text-[11px] opacity-60">code-server will be embedded here</p>
      </div>
    );
  }

  if (status === 'checking') {
    return (
      <div className="flex-1 h-full flex items-center justify-center flex-col gap-2 text-text-dim text-[13px]">
        <div className="text-[40px] opacity-30">⏳</div>
        <p>Checking code-server status...</p>
      </div>
    );
  }

  if (status === 'not-installed') {
    return (
      <div className="flex-1 h-full flex items-center justify-center flex-col gap-3 text-text-dim text-[13px]">
        <div className="text-[40px] opacity-30">📦</div>
        <p className="font-medium">code-server not installed</p>
        <p className="text-[11px] opacity-60 max-w-xs text-center">
          Install code-server to use the integrated editor:
        </p>
        <code className="bg-bg-secondary px-3 py-2 rounded text-[11px] font-mono">
          curl -fsSL https://code-server.dev/install.sh | sh
        </code>
      </div>
    );
  }

  if (status === 'stopped') {
    return (
      <div className="flex-1 h-full flex items-center justify-center flex-col gap-3 text-text-dim text-[13px]">
        <div className="text-[40px] opacity-30">🔌</div>
        <p className="font-medium">code-server not running</p>
        <button
          onClick={handleStart}
          className="mt-2 px-4 py-2 bg-accent text-white rounded hover:bg-accent/90 transition-colors text-[13px]"
        >
          Start code-server
        </button>
      </div>
    );
  }

  if (status === 'starting') {
    return (
      <div className="flex-1 h-full flex items-center justify-center flex-col gap-2 text-text-dim text-[13px]">
        <div className="text-[40px] opacity-30 animate-pulse">🚀</div>
        <p>Starting code-server...</p>
      </div>
    );
  }

  // Build direct URL to code-server
  const codeServerUrl = codeServerPort
    ? `http://${window.location.hostname}:${codeServerPort}/?folder=${encodeURIComponent(currentSession.projectPath || '')}`
    : '';

  return (
    <div className="flex-1 flex flex-col bg-bg min-h-0 h-full">
      <iframe
        src={codeServerUrl}
        className="w-full h-full border-none flex-1"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}
