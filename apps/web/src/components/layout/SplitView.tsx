import { useState, useRef, useEffect, useCallback } from 'react';
import TerminalView from '../terminal/TerminalView';
import PreviewPane from '../preview/PreviewPane';
import { cn } from '../../lib/utils';

export default function SplitView() {
  const [splitRatio, setSplitRatio] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Determine if mobile (vertical) or desktop (horizontal)
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 600);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const calculateRatio = useCallback((clientX: number, clientY: number) => {
    if (!containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    let ratio: number;
    if (isMobile) {
      ratio = ((clientY - rect.top) / rect.height) * 100;
    } else {
      ratio = ((clientX - rect.left) / rect.width) * 100;
    }
    return Math.min(Math.max(ratio, 20), 80);
  }, [isMobile]);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    // Capture pointer to receive all events even outside the element
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setIsDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const ratio = calculateRatio(e.clientX, e.clientY);
    if (ratio !== null) {
      setSplitRatio(ratio);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDragging) {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      setIsDragging(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn('flex-1 flex overflow-hidden h-full', isMobile ? 'flex-col' : 'flex-row')}
    >
      {/* Terminal pane */}
      <div
        className="overflow-hidden h-full flex flex-col"
        style={{
          [isMobile ? 'height' : 'width']: `${splitRatio}%`,
          flexShrink: 0,
        }}
      >
        <TerminalView />
      </div>

      {/* Resizer */}
      <div
        className={cn(
          'flex-shrink-0 flex items-center justify-center bg-transparent touch-none',
          isMobile ? 'h-2 w-full cursor-row-resize' : 'w-2 h-full cursor-col-resize',
          isDragging && 'bg-accent/20'
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div
          className={cn(
            'bg-surface-2 transition-colors',
            isDragging && 'bg-accent',
            isMobile ? 'w-8 h-[3px]' : 'h-8 w-[3px]'
          )}
        />
      </div>

      {/* Preview pane */}
      <div className="flex-1 overflow-hidden h-full flex flex-col">
        <PreviewPane />
      </div>
    </div>
  );
}
