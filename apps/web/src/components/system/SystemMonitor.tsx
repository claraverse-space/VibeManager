import { useSessionStore } from '../../stores/sessionStore';
import {
  formatBytes,
  generateAsciiBar,
  getTemperatureClass,
  cn,
} from '../../lib/utils';

export default function SystemMonitor() {
  const { systemStats } = useSessionStore();

  if (!systemStats) return null;

  const cpuBar = generateAsciiBar(systemStats.cpu.percent);
  const memBar = generateAsciiBar(systemStats.memory.percent);
  const diskBar = generateAsciiBar(systemStats.disk.percent);
  const tempClass = getTemperatureClass(systemStats.temperature);

  return (
    <div className="bg-surface p-4 flex-shrink-0 mt-auto">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-text-dim mb-3">
        System Monitor
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
        {/* CPU */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between items-center text-[11px] text-text-dim">
            <span>CPU</span>
            <span className="font-mono font-semibold text-text-primary">
              {systemStats.cpu.percent.toFixed(1)}%
            </span>
          </div>
          <div className={cn('sysmon-bar', systemStats.cpu.percent > 80 ? 'hot' : systemStats.cpu.percent > 60 ? 'warm' : 'cool')}>
            <span className="filled">{cpuBar.filled}</span>
            <span className="empty">{cpuBar.empty}</span>
          </div>
        </div>

        {/* Memory */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between items-center text-[11px] text-text-dim">
            <span>Memory</span>
            <span className="font-mono font-semibold text-text-primary">
              {formatBytes(systemStats.memory.used)} / {formatBytes(systemStats.memory.total)}
            </span>
          </div>
          <div className={cn('sysmon-bar', systemStats.memory.percent > 80 ? 'hot' : systemStats.memory.percent > 60 ? 'warm' : 'cool')}>
            <span className="filled">{memBar.filled}</span>
            <span className="empty">{memBar.empty}</span>
          </div>
        </div>

        {/* Disk */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between items-center text-[11px] text-text-dim">
            <span>Disk</span>
            <span className="font-mono font-semibold text-text-primary">
              {formatBytes(systemStats.disk.used)} / {formatBytes(systemStats.disk.total)}
            </span>
          </div>
          <div className={cn('sysmon-bar', systemStats.disk.percent > 90 ? 'hot' : systemStats.disk.percent > 75 ? 'warm' : 'cool')}>
            <span className="filled">{diskBar.filled}</span>
            <span className="empty">{diskBar.empty}</span>
          </div>
        </div>

        {/* Load Average */}
        <div className="flex flex-col gap-1">
          <div className="text-[11px] text-text-dim">Load Average</div>
          <div className="font-mono text-[12px] text-text-primary flex gap-2.5">
            <span>{systemStats.load[0].toFixed(2)}</span>
            <span>{systemStats.load[1].toFixed(2)}</span>
            <span>{systemStats.load[2].toFixed(2)}</span>
          </div>
        </div>

        {/* Network */}
        <div className="flex flex-col gap-1">
          <div className="text-[11px] text-text-dim">Network</div>
          <div className="font-mono text-[11px] flex gap-3">
            <span className="text-success">↓ {formatBytes(systemStats.network.rx)}</span>
            <span className="text-accent">↑ {formatBytes(systemStats.network.tx)}</span>
          </div>
        </div>

        {/* Temperature */}
        {systemStats.temperature > 0 && (
          <div className="flex flex-col gap-1">
            <div className="text-[11px] text-text-dim">Temperature</div>
            <div className={cn('font-mono text-[20px] font-bold', {
              'text-success': tempClass === 'cool',
              'text-warn': tempClass === 'warm',
              'text-danger': tempClass === 'hot',
            })}>
              {systemStats.temperature}°C
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
