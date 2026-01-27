import { useUIStore } from '../../stores/uiStore';
import { cn } from '../../lib/utils';
import type { ViewMode } from '@vibemanager/shared';

const TABS: { mode: ViewMode; label: string }[] = [
  { mode: 'dashboard', label: 'Dashboard' },
  { mode: 'terminal', label: 'Terminal' },
  { mode: 'code', label: 'Code' },
  { mode: 'preview', label: 'Preview' },
  { mode: 'split', label: 'Split' },
];

export default function ViewTabs() {
  const { viewMode, setViewMode } = useUIStore();

  return (
    <div className="flex gap-0.5 px-3 py-1 bg-surface flex-shrink-0">
      {TABS.map(({ mode, label }) => (
        <button
          key={mode}
          className={cn('view-tab', viewMode === mode && 'active')}
          onClick={() => setViewMode(mode)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
