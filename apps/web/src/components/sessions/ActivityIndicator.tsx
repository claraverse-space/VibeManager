import { cn } from '../../lib/utils';
import type { SessionActivity, ActivityState } from '@vibemanager/shared';

interface ActivityIndicatorProps {
  activity: SessionActivity;
  alive: boolean;
}

const stateConfig: Record<ActivityState, { label: string; dotClass: string; animate?: string }> = {
  active: {
    label: 'Active',
    dotClass: 'bg-success',
    animate: 'animate-pulse-fast',
  },
  idle: {
    label: 'Idle',
    dotClass: 'bg-warn',
  },
  waiting_for_input: {
    label: 'Waiting',
    dotClass: 'bg-accent',
    animate: 'animate-pulse-slow',
  },
};

export default function ActivityIndicator({ activity, alive }: ActivityIndicatorProps) {
  if (!alive) {
    return (
      <div className="flex items-center gap-1.5">
        <div className="status-dot dead" />
        <span className="text-[10px] text-text-dim uppercase tracking-wider">Stopped</span>
      </div>
    );
  }

  const config = stateConfig[activity.activityState];

  return (
    <div className="flex items-center gap-1.5">
      <div
        className={cn(
          'status-dot',
          config.dotClass,
          config.animate
        )}
      />
      <span className="text-[10px] text-text-dim uppercase tracking-wider">
        {config.label}
      </span>
    </div>
  );
}
