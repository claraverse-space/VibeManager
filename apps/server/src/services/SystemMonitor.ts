import { readFileSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { cpus, totalmem, freemem, loadavg, uptime as osUptime } from 'os';
import type { SystemStats, ListeningPort } from '@vibemanager/shared';

const isMacOS = process.platform === 'darwin';

interface CpuInfo {
  total: number;
  idle: number;
}

interface NetworkInfo {
  rx: number;
  tx: number;
  timestamp: number;
}

/**
 * Service for monitoring system resources
 */
export class SystemMonitor {
  private prevCpu: CpuInfo | null = null;
  private prevNetwork: NetworkInfo | null = null;
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
      if (isMacOS) {
        // macOS: use top command for CPU usage
        const result = execFileSync('top', ['-l', '1', '-n', '0'], { encoding: 'utf8', timeout: 5000 });
        const cpuMatch = result.match(/CPU usage:\s+(\d+\.?\d*)%\s+user,\s+(\d+\.?\d*)%\s+sys/);
        const percent = cpuMatch ? parseFloat(cpuMatch[1]) + parseFloat(cpuMatch[2]) : 0;
        return { percent: Math.round(percent * 10) / 10, cores: cpus().length };
      }
      
      // Linux: use /proc/stat
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
      return { percent: 0, cores: cpus().length || 1 };
    }
  }

  private getMemory(): { total: number; used: number; percent: number } {
    try {
      if (isMacOS) {
        // macOS: use Node.js os module (cross-platform)
        const total = totalmem();
        const free = freemem();
        const used = total - free;
        const percent = total > 0 ? (used / total) * 100 : 0;
        return { total, used, percent: Math.round(percent * 10) / 10 };
      }
      
      // Linux: use /proc/meminfo for more accurate readings
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
      // Fallback to Node.js os module
      const total = totalmem();
      const free = freemem();
      const used = total - free;
      return { total, used, percent: Math.round((used / total) * 1000) / 10 };
    }
  }

  private getSwap(): { total: number; used: number; percent: number } {
    try {
      if (isMacOS) {
        // macOS: use sysctl for swap info
        const result = execFileSync('sysctl', ['-n', 'vm.swapusage'], { encoding: 'utf8', timeout: 5000 });
        // Output: "total = 2048.00M  used = 1024.00M  free = 1024.00M"
        const totalMatch = result.match(/total\s*=\s*(\d+\.?\d*)M/);
        const usedMatch = result.match(/used\s*=\s*(\d+\.?\d*)M/);
        const total = totalMatch ? parseFloat(totalMatch[1]) * 1024 * 1024 : 0;
        const used = usedMatch ? parseFloat(usedMatch[1]) * 1024 * 1024 : 0;
        const percent = total > 0 ? (used / total) * 100 : 0;
        return { total, used, percent: Math.round(percent * 10) / 10 };
      }
      
      // Linux: use /proc/meminfo
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
      // df works on both Linux and macOS but with different flags
      const args = isMacOS ? ['-k', '/'] : ['-B1', '/'];
      const result = execFileSync('df', args, { encoding: 'utf8' });
      const lines = result.split('\n');
      if (lines.length < 2) return { total: 0, used: 0, percent: 0 };

      const parts = lines[1].split(/\s+/);
      // On macOS with -k, values are in KB; on Linux with -B1, values are in bytes
      const multiplier = isMacOS ? 1024 : 1;
      const total = parseInt(parts[1], 10) * multiplier;
      const used = parseInt(parts[2], 10) * multiplier;
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
    if (isMacOS) {
      // macOS: temperature requires special tools (osx-cpu-temp or similar)
      // Skip for now as it requires additional installation
      return 0;
    }
    
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
      // Node.js os.loadavg() works on both Linux and macOS
      const load = loadavg();
      return [
        Math.round(load[0] * 100) / 100,
        Math.round(load[1] * 100) / 100,
        Math.round(load[2] * 100) / 100,
      ];
    } catch {
      return [0, 0, 0];
    }
  }

  private getNetwork(): { rx: number; tx: number } {
    try {
      let currentRx = 0;
      let currentTx = 0;
      
      if (isMacOS) {
        // macOS: use netstat -ibn and parse with awk-like logic
        const result = execFileSync('netstat', ['-ibn'], { encoding: 'utf8', timeout: 5000 });
        const lines = result.split('\n');

        for (const line of lines) {
          // Only process lines with Link# (physical link stats) and skip loopback
          if (!line.includes('<Link#') || line.startsWith('lo')) continue;
          
          const parts = line.split(/\s+/).filter(Boolean);
          // Format: Name Mtu Network Address Ipkts Ierrs Ibytes Opkts Oerrs Obytes Coll
          // Index:  0    1   2       3       4     5     6      7     8     9      10
          if (parts.length >= 10) {
            const ibytes = parseInt(parts[6], 10) || 0;
            const obytes = parseInt(parts[9], 10) || 0;
            currentRx += ibytes;
            currentTx += obytes;
          }
        }
      } else {
        // Linux: use /proc/net/dev
        const netDev = readFileSync('/proc/net/dev', 'utf8');
        const lines = netDev.split('\n');

        for (const line of lines) {
          // Skip loopback and header lines
          if (line.includes('lo:') || !line.includes(':')) continue;

          const parts = line.split(/\s+/).filter(Boolean);
          if (parts.length >= 10) {
            const ifRx = parseInt(parts[1], 10) || 0;
            const ifTx = parseInt(parts[9], 10) || 0;
            currentRx += ifRx;
            currentTx += ifTx;
          }
        }
      }

      const now = Date.now();
      
      // Calculate speed (bytes per second)
      if (this.prevNetwork) {
        const timeDelta = (now - this.prevNetwork.timestamp) / 1000; // seconds
        if (timeDelta > 0) {
          const rxSpeed = Math.max(0, (currentRx - this.prevNetwork.rx) / timeDelta);
          const txSpeed = Math.max(0, (currentTx - this.prevNetwork.tx) / timeDelta);
          
          // Update previous values
          this.prevNetwork = { rx: currentRx, tx: currentTx, timestamp: now };
          
          return { rx: Math.round(rxSpeed), tx: Math.round(txSpeed) };
        }
      }
      
      // First call - store current values and return 0
      this.prevNetwork = { rx: currentRx, tx: currentTx, timestamp: now };
      return { rx: 0, tx: 0 };
    } catch {
      return { rx: 0, tx: 0 };
    }
  }

  private getUptime(): number {
    try {
      // Node.js os.uptime() works on both Linux and macOS
      return Math.floor(osUptime());
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
    if (process.platform === 'darwin') {
      // macOS: use lsof
      const result = execFileSync(
        'lsof',
        ['-iTCP', '-sTCP:LISTEN', '-nP'],
        { encoding: 'utf8', timeout: 5000 }
      );

      const lines = result.split('\n').slice(1); // Skip header
      const ports: ListeningPort[] = [];
      const seen = new Set<number>();

      for (const line of lines) {
        // Example: node    12345 user   20u  IPv4 0x... TCP *:3000 (LISTEN)
        const parts = line.split(/\s+/);
        if (parts.length < 9) continue;
        
        const processName = parts[0];
        const pid = parseInt(parts[1], 10);
        const nameField = parts[8]; // e.g., "*:3000" or "localhost:3000"
        
        const portMatch = nameField.match(/:(\d+)$/);
        if (portMatch) {
          const port = parseInt(portMatch[1], 10);
          if (!seen.has(port)) {
            seen.add(port);
            ports.push({ port, process: processName, pid });
          }
        }
      }

      return ports.sort((a, b) => a.port - b.port);
    } else {
      // Linux: use ss
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
    }
  } catch {
    return [];
  }
}

// Export singleton instance
export const systemMonitor = new SystemMonitor();
