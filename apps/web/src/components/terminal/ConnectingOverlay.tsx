interface ConnectingOverlayProps {
  sessionName: string | null;
}

export default function ConnectingOverlay({ sessionName }: ConnectingOverlayProps) {
  return (
    <div className="absolute inset-0 bg-bg flex flex-col items-center justify-center z-10 font-mono">
      <div className="text-accent text-[13px] mb-3">
        {sessionName ? `Connecting to ${sessionName}...` : 'Select a session'}
      </div>

      {sessionName && (
        <div className="flex gap-[3px]">
          {[...Array(8)].map((_, i) => (
            <span
              key={i}
              className="w-1.5 h-4 bg-accent"
              style={{
                opacity: 0.2,
                animation: 'co-pulse 0.8s ease-in-out infinite',
                animationDelay: `${i * 0.1}s`,
              }}
            />
          ))}
        </div>
      )}

      {sessionName && (
        <div className="text-text-dim text-[11px] mt-2.5">
          {sessionName}
        </div>
      )}
    </div>
  );
}
