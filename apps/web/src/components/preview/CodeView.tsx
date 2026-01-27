import { useCurrentSession } from '../../stores/sessionStore';
import { useEffect, useState } from 'react';
import { getCodeServerUrl } from '../../lib/baseUrl';

export default function CodeView() {
  const currentSession = useCurrentSession();
  const [codeServerReady, setCodeServerReady] = useState(false);

  useEffect(() => {
    // Check if code-server is ready
    const checkCodeServer = async () => {
      try {
        const res = await fetch('/api/code/status');
        const data = await res.json();
        setCodeServerReady(data.data?.running === true);
      } catch {
        setCodeServerReady(false);
      }
    };

    checkCodeServer();
    const interval = setInterval(checkCodeServer, 5000);
    return () => clearInterval(interval);
  }, []);

  if (!currentSession) {
    return (
      <div className="flex-1 h-full flex items-center justify-center flex-col gap-2 text-text-dim text-[13px]">
        <div className="text-[40px] opacity-30">📝</div>
        <p>Select a session to open in code editor</p>
        <p className="text-[11px] opacity-60">code-server will be embedded here</p>
      </div>
    );
  }

  if (!codeServerReady) {
    return (
      <div className="flex-1 h-full flex items-center justify-center flex-col gap-2 text-text-dim text-[13px]">
        <div className="text-[40px] opacity-30">⏳</div>
        <p>Starting code-server...</p>
      </div>
    );
  }

  // Use dynamic URL for remote access support
  const codeServerUrl = getCodeServerUrl(currentSession.projectPath);

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
