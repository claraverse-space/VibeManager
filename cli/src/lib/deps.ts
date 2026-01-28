import { execFileSync, spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

interface DependencyCheck {
  name: string;
  installed: boolean;
  path?: string;
  version?: string;
}

/**
 * Check if bun is installed
 */
export function checkBun(): DependencyCheck {
  try {
    const version = execFileSync('bun', ['--version'], {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();

    return {
      name: 'bun',
      installed: true,
      version,
    };
  } catch {
    return { name: 'bun', installed: false };
  }
}

/**
 * Check if tmux is installed
 */
export function checkTmux(): DependencyCheck {
  try {
    const version = execFileSync('tmux', ['-V'], {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();

    return {
      name: 'tmux',
      installed: true,
      version,
    };
  } catch {
    return { name: 'tmux', installed: false };
  }
}

/**
 * Check if code-server is installed
 */
export function checkCodeServer(): DependencyCheck {
  const paths = [
    join(homedir(), '.local', 'bin', 'code-server'),
    '/opt/homebrew/bin/code-server',  // macOS Homebrew (Apple Silicon)
    '/usr/local/bin/code-server',      // macOS Homebrew (Intel) / Linux
    '/usr/bin/code-server',
  ];

  // First check known paths
  for (const path of paths) {
    if (existsSync(path)) {
      try {
        const version = execFileSync(path, ['--version'], {
          encoding: 'utf-8',
          timeout: 5000,
        }).trim().split('\n')[0];

        return {
          name: 'code-server',
          installed: true,
          path,
          version,
        };
      } catch {
        return { name: 'code-server', installed: true, path };
      }
    }
  }

  // Fallback: try 'which' command to find it in PATH
  try {
    const whichPath = execFileSync('which', ['code-server'], {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();

    if (whichPath && existsSync(whichPath)) {
      try {
        const version = execFileSync(whichPath, ['--version'], {
          encoding: 'utf-8',
          timeout: 5000,
        }).trim().split('\n')[0];

        return {
          name: 'code-server',
          installed: true,
          path: whichPath,
          version,
        };
      } catch {
        return { name: 'code-server', installed: true, path: whichPath };
      }
    }
  } catch {
    // which failed, code-server not in PATH
  }

  return { name: 'code-server', installed: false };
}

/**
 * Install code-server using the official install script
 */
export function installCodeServer(): boolean {
  console.log('Installing code-server...');

  try {
    // Use the official install script
    const result = spawnSync('sh', ['-c', 'curl -fsSL https://code-server.dev/install.sh | sh'], {
      stdio: 'inherit',
      timeout: 300000, // 5 minute timeout
    });

    if (result.status !== 0) {
      console.error('code-server installation failed');
      return false;
    }

    // Verify installation
    const check = checkCodeServer();
    if (check.installed) {
      console.log(`  ✓ code-server installed successfully (${check.version || 'version unknown'})`);
      return true;
    } else {
      console.error('code-server installation completed but binary not found');
      return false;
    }
  } catch (err) {
    console.error('Failed to install code-server:', err);
    return false;
  }
}

/**
 * Check all dependencies
 */
export function checkAllDependencies(): DependencyCheck[] {
  return [
    checkBun(),
    checkTmux(),
    checkCodeServer(),
  ];
}

/**
 * Get VibeManager data directory
 */
export function getDataDir(): string {
  return join(homedir(), '.local', 'share', 'vibemanager');
}

/**
 * Get database path
 */
export function getDatabasePath(): string {
  return join(getDataDir(), 'vibemanager.db');
}
