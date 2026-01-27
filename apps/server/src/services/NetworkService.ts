import { execFileSync } from 'child_process';
import { networkInterfaces, hostname } from 'os';
import { existsSync } from 'fs';

interface AccessURL {
  type: 'local' | 'tailscale' | 'lan';
  url: string;
  label: string;
}

interface TailscaleStatus {
  installed: boolean;
  connected: boolean;
  ip: string | null;
  hostname: string | null;
}

interface NetworkInfo {
  urls: AccessURL[];
  port: number;
  hostname: string;
  tailscale: TailscaleStatus | null;
}

/**
 * Service for detecting network information and access URLs
 */
class NetworkService {
  /**
   * Get all available access URLs for the server
   */
  getAccessURLs(port: number): NetworkInfo {
    const urls: AccessURL[] = [];
    const host = hostname();

    // Get local IPs
    const localIPs = this.getLocalIPs();
    for (const ip of localIPs) {
      urls.push({
        type: 'lan',
        url: `http://${ip}:${port}`,
        label: 'Local Network',
      });
    }

    // Check Tailscale
    const tailscale = this.getTailscaleStatus();
    if (tailscale?.connected && tailscale.ip) {
      urls.push({
        type: 'tailscale',
        url: `http://${tailscale.ip}:${port}`,
        label: 'Tailscale',
      });
    }

    // Add localhost
    urls.unshift({
      type: 'local',
      url: `http://localhost:${port}`,
      label: 'Localhost',
    });

    return {
      urls,
      port,
      hostname: host,
      tailscale,
    };
  }

  /**
   * Get local network IPs (192.168.x.x, 10.x.x.x, etc.)
   */
  getLocalIPs(): string[] {
    const ips: string[] = [];
    const interfaces = networkInterfaces();

    for (const name of Object.keys(interfaces)) {
      const nets = interfaces[name];
      if (!nets) continue;

      for (const net of nets) {
        // Skip internal and IPv6
        if (net.internal || net.family !== 'IPv4') continue;

        // Only include private IPs
        if (
          net.address.startsWith('192.168.') ||
          net.address.startsWith('10.') ||
          net.address.match(/^172\.(1[6-9]|2\d|3[01])\./)
        ) {
          ips.push(net.address);
        }
      }
    }

    return ips;
  }

  /**
   * Check Tailscale status
   */
  getTailscaleStatus(): TailscaleStatus | null {
    try {
      // Check if tailscale command exists
      const tailscalePath = this.findTailscale();
      if (!tailscalePath) {
        return { installed: false, connected: false, ip: null, hostname: null };
      }

      // Get tailscale IP using execFileSync (safe, no shell injection)
      let ip: string | null = null;
      try {
        ip = execFileSync(tailscalePath, ['ip', '-4'], {
          encoding: 'utf-8',
          timeout: 5000,
        }).trim();
      } catch {
        // Tailscale not connected
      }

      // Get tailscale hostname
      let tsHostname: string | null = null;
      try {
        const status = execFileSync(tailscalePath, ['status', '--json'], {
          encoding: 'utf-8',
          timeout: 5000,
        });
        const parsed = JSON.parse(status);
        tsHostname = parsed.Self?.HostName || null;
      } catch {
        // Failed to get status
      }

      return {
        installed: true,
        connected: !!ip,
        ip,
        hostname: tsHostname,
      };
    } catch {
      return null;
    }
  }

  /**
   * Find tailscale binary path
   */
  private findTailscale(): string | null {
    const paths = [
      '/usr/bin/tailscale',
      '/usr/local/bin/tailscale',
      '/opt/homebrew/bin/tailscale',
    ];

    for (const path of paths) {
      if (existsSync(path)) {
        return path;
      }
    }

    // Try which using execFileSync
    try {
      return execFileSync('which', ['tailscale'], {
        encoding: 'utf-8',
        timeout: 1000,
      }).trim();
    } catch {
      return null;
    }
  }
}

export const networkService = new NetworkService();
