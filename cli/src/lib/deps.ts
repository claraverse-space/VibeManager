import { execFileSync } from 'child_process';
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
    '/usr/local/bin/code-server',
    '/usr/bin/code-server',
  ];

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

  return { name: 'code-server', installed: false };
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
