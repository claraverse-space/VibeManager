import { useRef, useState, useEffect } from 'react';
import { RefreshCw, ExternalLink, Maximize2 } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { useSessionStore, useCurrentSession } from '../../stores/sessionStore';
import { sessionsApi } from '../../lib/api';
import { cn } from '../../lib/utils';
import { getPreviewUrl } from '../../lib/baseUrl';

export default function PreviewPane() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const {
    previewUrl,
    setPreviewUrl,
    previewPort,
    setPreviewPort,
    setPreviewFromPort,
  } = useUIStore();
  const { ports, updateSession } = useSessionStore();
  const currentSession = useCurrentSession();
  const [inputUrl, setInputUrl] = useState(previewUrl);

  // Restore saved preview port when session changes
  useEffect(() => {
    // When session changes, restore its port or clear if none
    if (currentSession) {
      setPreviewFromPort(currentSession.previewPort);
    }
  }, [currentSession?.name, currentSession?.previewPort, setPreviewFromPort]);

  // Keep input URL in sync with preview URL
  useEffect(() => {
    setInputUrl(previewUrl);
  }, [previewUrl]);

  // Filter to common development ports
  const devPorts = ports.filter(
    (p) => p.port >= 3000 && p.port <= 9000 && p.port !== 3131
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPreviewUrl(inputUrl);
  };

  const handleRefresh = () => {
    if (iframeRef.current) {
      iframeRef.current.src = previewUrl;
    }
  };

  const handleOpenExternal = () => {
    if (previewUrl) {
      window.open(previewUrl, '_blank');
    }
  };

  const handleFullscreen = () => {
    if (iframeRef.current) {
      iframeRef.current.requestFullscreen?.();
    }
  };

  const handlePortClick = async (port: number) => {
    const url = getPreviewUrl(port);
    setPreviewUrl(url);
    setInputUrl(url);
    setPreviewPort(port);
    // Save port for current session to database and update local store
    if (currentSession) {
      updateSession(currentSession.name, { previewPort: port });
      try {
        await sessionsApi.setPreviewPort(currentSession.name, port);
      } catch {
        // Ignore errors, the UI is already updated
      }
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-bg min-h-0 h-full">
      {/* URL bar */}
      <div className="flex items-center gap-1 px-2 py-1 bg-surface flex-shrink-0">
        <form onSubmit={handleSubmit} className="flex-1 flex gap-1">
          <input
            type="text"
            className="input flex-1 py-1.5"
            placeholder="http://localhost:3000"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
          />
          <button type="submit" className="btn py-1.5 px-3">
            Go
          </button>
        </form>

        {/* Port quick buttons */}
        {devPorts.slice(0, 3).map((p) => (
          <button
            key={p.port}
            className={cn(
              'btn py-1.5 px-2 font-mono text-[11px]',
              previewPort === p.port && 'btn-primary'
            )}
            onClick={() => handlePortClick(p.port)}
          >
            {p.port}
          </button>
        ))}

        <button className="btn py-1.5 px-2" onClick={handleRefresh} title="Refresh">
          <RefreshCw className="w-4 h-4" />
        </button>
        <button className="btn py-1.5 px-2" onClick={handleOpenExternal} title="Open in new tab">
          <ExternalLink className="w-4 h-4" />
        </button>
        <button className="btn py-1.5 px-2" onClick={handleFullscreen} title="Fullscreen">
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>

      {/* Preview iframe */}
      <div className="flex-1 min-h-0 h-full relative">
        {previewUrl ? (
          <iframe
            ref={iframeRef}
            src={previewUrl}
            className="w-full h-full border-none"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-text-dim text-[13px] flex-col gap-2.5 p-5 text-center">
            <div className="text-[32px] opacity-20">👁️</div>
            <p>Enter a URL or select a port to preview</p>
            <p className="text-[11px] opacity-50">
              Development server will appear here
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
