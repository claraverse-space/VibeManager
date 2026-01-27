import { useSessionStore } from '../../stores/sessionStore';
import { useUIStore } from '../../stores/uiStore';
import { cn } from '../../lib/utils';
import { getPreviewUrl } from '../../lib/baseUrl';

export default function PortButtons() {
  const { ports } = useSessionStore();
  const { previewPort, setPreviewPort, setPreviewUrl, setViewMode } = useUIStore();

  // Filter to common development ports
  const devPorts = ports.filter(
    (p) => p.port >= 3000 && p.port <= 9000 && p.port !== 3131
  );

  if (devPorts.length === 0) return null;

  const handlePortClick = (port: number) => {
    if (previewPort === port) {
      setPreviewPort(null);
      setPreviewUrl('');
    } else {
      setPreviewPort(port);
      setPreviewUrl(getPreviewUrl(port));
      setViewMode('preview');
    }
  };

  return (
    <div className="flex items-center gap-1">
      {devPorts.slice(0, 5).map((p) => (
        <button
          key={p.port}
          className={cn(
            'bg-surface-2 text-[11px] py-1 px-2 font-mono font-semibold cursor-pointer border-none transition-colors',
            previewPort === p.port && 'bg-accent text-white'
          )}
          onClick={() => handlePortClick(p.port)}
          title={`${p.process} (PID: ${p.pid})`}
        >
          {p.port}
        </button>
      ))}
    </div>
  );
}
