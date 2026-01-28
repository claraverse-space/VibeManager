import { execFileSync, execSync } from 'child_process';
import { existsSync, readFileSync, rmSync, mkdirSync, cpSync } from 'fs';
import { join } from 'path';

const GITHUB_REPO = 'claraverse-space/VibeManager';
const CHECK_INTERVAL = 60 * 60 * 1000; // Check every hour

interface VersionInfo {
  current: string;
  latest: string | null;
  updateAvailable: boolean;
  lastChecked: Date | null;
}

interface ReleaseInfo {
  tag_name: string;
  published_at: string;
  html_url: string;
}

class UpdateService {
  private currentVersion: string;
  private latestVersion: string | null = null;
  private lastChecked: Date | null = null;
  private checking = false;

  constructor() {
    this.currentVersion = this.readCurrentVersion();
    // Start periodic version check
    this.checkForUpdates();
    setInterval(() => this.checkForUpdates(), CHECK_INTERVAL);
  }

  /**
   * Read current version from package.json
   */
  private readCurrentVersion(): string {
    try {
      // Try to find package.json relative to the server
      const possiblePaths = [
        join(import.meta.dir, '..', '..', '..', '..', 'package.json'), // Development
        join(import.meta.dir, '..', 'package.json'), // Bundled
        join(process.cwd(), 'package.json'),
      ];

      for (const pkgPath of possiblePaths) {
        if (existsSync(pkgPath)) {
          const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
          return pkg.version || '0.0.0';
        }
      }
      return '0.0.0';
    } catch {
      return '0.0.0';
    }
  }

  /**
   * Get the source directory (for git pull updates)
   */
  private getSourceDir(): string | null {
    const possiblePaths = [
      join(import.meta.dir, '..', '..', '..', '..'), // Development: apps/server/src/services -> root
      join(process.env.HOME || '', '.local', 'share', 'vibemanager', 'source'),
    ];

    for (const dir of possiblePaths) {
      if (existsSync(join(dir, '.git'))) {
        return dir;
      }
    }
    return null;
  }

  /**
   * Check for updates from GitHub releases
   */
  async checkForUpdates(): Promise<VersionInfo> {
    if (this.checking) {
      return this.getVersionInfo();
    }

    this.checking = true;
    try {
      const response = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
        {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'VibeManager',
          },
        }
      );

      if (response.ok) {
        const release: ReleaseInfo = await response.json();
        // Remove 'v' prefix if present
        this.latestVersion = release.tag_name.replace(/^v/, '');
        this.lastChecked = new Date();
      }
    } catch (error) {
      console.error('Failed to check for updates:', error);
    } finally {
      this.checking = false;
    }

    return this.getVersionInfo();
  }

  /**
   * Get current version info
   */
  getVersionInfo(): VersionInfo {
    return {
      current: this.currentVersion,
      latest: this.latestVersion,
      updateAvailable: this.isUpdateAvailable(),
      lastChecked: this.lastChecked,
    };
  }

  /**
   * Check if an update is available
   */
  isUpdateAvailable(): boolean {
    if (!this.latestVersion) return false;
    return this.compareVersions(this.latestVersion, this.currentVersion) > 0;
  }

  /**
   * Compare two semantic versions
   * Returns: 1 if a > b, -1 if a < b, 0 if equal
   */
  private compareVersions(a: string, b: string): number {
    const partsA = a.split('.').map(Number);
    const partsB = b.split('.').map(Number);

    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const partA = partsA[i] || 0;
      const partB = partsB[i] || 0;
      if (partA > partB) return 1;
      if (partA < partB) return -1;
    }
    return 0;
  }

  /**
   * Apply update from git source
   */
  async applyUpdate(): Promise<{ success: boolean; message: string; needsRestart: boolean }> {
    const sourceDir = this.getSourceDir();

    if (!sourceDir) {
      return {
        success: false,
        message: 'Cannot update: source directory not found. Please reinstall VibeManager.',
        needsRestart: false,
      };
    }

    try {
      // Fetch latest changes
      console.log('Fetching updates...');
      execFileSync('git', ['fetch', 'origin'], { cwd: sourceDir, stdio: 'pipe' });

      // Check if there are changes
      const localRef = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sourceDir, encoding: 'utf-8' }).trim();
      const remoteRef = execFileSync('git', ['rev-parse', 'origin/master'], { cwd: sourceDir, encoding: 'utf-8' }).trim();

      if (localRef === remoteRef) {
        return {
          success: true,
          message: 'Already up to date',
          needsRestart: false,
        };
      }

      // Pull latest changes
      console.log('Pulling updates...');
      execFileSync('git', ['pull', 'origin', 'master'], { cwd: sourceDir, stdio: 'pipe' });

      // Install dependencies
      console.log('Installing dependencies...');
      execFileSync('bun', ['install'], { cwd: sourceDir, stdio: 'pipe' });

      // Run migrations
      console.log('Running migrations...');
      execFileSync('bun', ['run', 'db:migrate'], { cwd: sourceDir, stdio: 'pipe' });

      // Rebuild frontend
      console.log('Rebuilding frontend...');
      execFileSync('bun', ['run', '--filter', '@vibemanager/web', 'build'], { cwd: sourceDir, stdio: 'pipe' });

      // Copy frontend to server using fs operations (no shell needed)
      const webDist = join(sourceDir, 'apps', 'web', 'dist');
      const serverPublic = join(sourceDir, 'apps', 'server', 'public');
      if (existsSync(webDist)) {
        if (existsSync(serverPublic)) {
          rmSync(serverPublic, { recursive: true });
        }
        mkdirSync(serverPublic, { recursive: true });
        cpSync(webDist, serverPublic, { recursive: true });
      }

      // Re-read version
      this.currentVersion = this.readCurrentVersion();

      return {
        success: true,
        message: `Updated to version ${this.currentVersion}`,
        needsRestart: true,
      };
    } catch (error) {
      console.error('Update failed:', error);
      return {
        success: false,
        message: `Update failed: ${error instanceof Error ? error.message : String(error)}`,
        needsRestart: false,
      };
    }
  }

  /**
   * Schedule server restart
   */
  scheduleRestart(delayMs: number = 2000): void {
    console.log(`Scheduling restart in ${delayMs}ms...`);
    setTimeout(() => {
      console.log('Restarting server...');
      process.exit(0); // Exit with 0, supervisor/tmux will restart
    }, delayMs);
  }
}

export const updateService = new UpdateService();
