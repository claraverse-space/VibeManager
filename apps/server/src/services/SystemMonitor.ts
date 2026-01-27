import { readFileSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import type { SystemStats, ListeningPort } from '@vibemanager/shared';

interface CpuInfo {
  total: number;
  idle: number;
}

/**
 * Service for monitoring system resources
 */
export class SystemMonitor {
  private prevCpu: CpuInfo | null = null;
  private cachedStats: SystemStats | null = null;
  private lastUpdate = 0;
  private readonly cacheMs = 1000; // Cache for 1 second

  /**
   * Get current system stats
   */
  getStats(): SystemStats {
    const now = Date.now();
    if (this.cachedStats && now - this.lastUpdate < this.cacheMs) {
      return this.cachedStats;
    }

    this.cachedStats = this.collectStats();
    this.lastUpdate = now;
    return this.cachedStats;
  }

  private collectStats(): SystemStats {
    return {
      cpu: this.getCpu(),
      memory: this.getMemory(),
      swap: this.getSwap(),
      disk: this.getDisk(),
      temperature: this.getTemperature(),
      load: this.getLoad(),
      network: this.getNetwork(),
      uptime: this.getUptime(),
    };
  }

  private getCpu(): { percent: number; cores: number } {
    try {
      const stat = readFileSync('/proc/stat', 'utf8');
      const lines = stat.split('\n');
      const cpuLine = lines.find((l) => l.startsWith('cpu '));
      if (!cpuLine) return { percent: 0, cores: 1 };

      const parts = cpuLine.split(/\s+/).slice(1).map(Number);
      const idle = parts[3] + (parts[4] || 0); // idle + iowait
      const total = parts.reduce((a, b) => a + b, 0);

      let percent = 0;
      if (this.prevCpu) {
        const totalDiff = total - this.prevCpu.total;
        const idleDiff = idle - this.prevCpu.idle;
        percent = totalDiff > 0 ? ((totalDiff - idleDiff) / totalDiff) * 100 : 0;
      }

      this.prevCpu = { total, idle };

      // Count cores
      const cores = lines.filter((l) => l.match(/^cpu\d/)).length;

      return { percent: Math.round(percent * 10) / 10, cores };
    } catch {
      return { percent: 0, cores: 1 };
    }
  }

  private getMemory(): { total: number; used: number; percent: number } {
    try {
      const meminfo = readFileSync('/proc/meminfo', 'utf8');
      const getValue = (key: string): number => {
        const match = meminfo.match(new RegExp(`${key}:\\s+(\\d+)`));
        return match ? parseInt(match[1], 10) * 1024 : 0;
      };

      const total = getValue('MemTotal');
      const free = getValue('MemFree');
      const buffers = getValue('Buffers');
      const cached = getValue('Cached');
      const sReclaimable = getValue('SReclaimable');

      const used = total - free - buffers - cached - sReclaimable;
      const percent = total > 0 ? (used / total) * 100 : 0;

      return {
        total,
        used,
        percent: Math.round(percent * 10) / 10,
      };
    } catch {
      return { total: 0, used: 0, percent: 0 };
    }
  }

  private getSwap(): { total: number; used: number; percent: number } {
    try {
      const meminfo = readFileSync('/proc/meminfo', 'utf8');
      const getValue = (key: string): number => {
        const match = meminfo.match(new RegExp(`${key}:\\s+(\\d+)`));
        return match ? parseInt(match[1], 10) * 1024 : 0;
      };

      const total = getValue('SwapTotal');
      const free = getValue('SwapFree');
      const used = total - free;
      const percent = total > 0 ? (used / total) * 100 : 0;

      return {
        total,
        used,
        percent: Math.round(percent * 10) / 10,
      };
    } catch {
      return { total: 0, used: 0, percent: 0 };
    }
  }

  private getDisk(): { total: number; used: number; percent: number } {
    try {
      const result = execFileSync('df', ['-B1', '/'], { encoding: 'utf8' });
      const lines = result.split('\n');
      if (lines.length < 2) return { total: 0, used: 0, percent: 0 };

      const parts = lines[1].split(/\s+/);
      const total = parseInt(parts[1], 10);
      const used = parseInt(parts[2], 10);
      const percent = total > 0 ? (used / total) * 100 : 0;

      return {
        total,
        used,
        percent: Math.round(percent * 10) / 10,
      };
    } catch {
      return { total: 0, used: 0, percent: 0 };
    }
  }

  private getTemperature(): number {
    const paths = [
      '/sys/class/thermal/thermal_zone0/temp',
      '/sys/class/hwmon/hwmon0/temp1_input',
      '/sys/class/hwmon/hwmon1/temp1_input',
    ];

    for (const path of paths) {
      if (existsSync(path)) {
        try {
          const temp = parseInt(readFileSync(path, 'utf8').trim(), 10);
          return Math.round(temp / 1000);
        } catch {
          continue;
        }
      }
    }
    return 0;
  }

  private getLoad(): [number, number, number] {
    try {
      const loadavg = readFileSync('/proc/loadavg', 'utf8');
      const parts = loadavg.split(/\s+/);
      return [
        parseFloat(parts[0]) || 0,
        parseFloat(parts[1]) || 0,
        parseFloat(parts[2]) || 0,
      ];
    } catch {
      return [0, 0, 0];
    }
  }

  private getNetwork(): { rx: number; tx: number } {
    try {
      const netDev = readFileSync('/proc/net/dev', 'utf8');
      const lines = netDev.split('\n');
      let rx = 0;
      let tx = 0;

      for (const line of lines) {
        // Skip loopback and header lines
        if (line.includes('lo:') || !line.includes(':')) continue;

        const parts = line.split(/\s+/).filter(Boolean);
        if (parts.length >= 10) {
          const ifRx = parseInt(parts[1], 10) || 0;
          const ifTx = parseInt(parts[9], 10) || 0;
          rx += ifRx;
          tx += ifTx;
        }
      }

      return { rx, tx };
    } catch {
      return { rx: 0, tx: 0 };
    }
  }

  private getUptime(): number {
    try {
      const uptime = readFileSync('/proc/uptime', 'utf8');
      return Math.floor(parseFloat(uptime.split(/\s+/)[0]));
    } catch {
      return 0;
    }
  }
}

/**
 * Get listening ports
 */
export function getListeningPorts(): ListeningPort[] {
  try {
    const result = execFileSync(
      'ss',
      ['-tlnp'],
      { encoding: 'utf8', timeout: 5000 }
    );

    const lines = result.split('\n').slice(1); // Skip header
    const ports: ListeningPort[] = [];

    for (const line of lines) {
      const match = line.match(/:(\d+)\s+.*users:\(\("([^"]+)",pid=(\d+)/);
      if (match) {
        ports.push({
          port: parseInt(match[1], 10),
          process: match[2],
          pid: parseInt(match[3], 10),
        });
      }
    }

    return ports.sort((a, b) => a.port - b.port);
  } catch {
    return [];
  }
}

// Export singleton instance
export const systemMonitor = new SystemMonitor();
