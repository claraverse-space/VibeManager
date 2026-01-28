import { Command } from 'commander';
import { execFileSync, execSync } from 'child_process';
import { existsSync, readFileSync, rmSync, mkdirSync, cpSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { stopServer, startServer, checkHealth, isRunning, getPid } from '../lib/process';

const GITHUB_REPO = 'claraverse-space/VibeManager';

interface ReleaseInfo {
  tag_name: string;
  published_at: string;
  html_url: string;
}

function getSourceDir(): string | null {
  const possiblePaths = [
    join(import.meta.dir, '..', '..', '..'), // Development: cli/src/commands -> root
    join(homedir(), '.local', 'share', 'vibemanager', 'source'),
  ];

  for (const dir of possiblePaths) {
    if (existsSync(join(dir, '.git'))) {
      return dir;
    }
  }
  return null;
}

function getCurrentVersion(): string {
  try {
    const possiblePaths = [
      join(import.meta.dir, '..', '..', '..', 'package.json'), // Development
      join(homedir(), '.local', 'share', 'vibemanager', 'source', 'package.json'),
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

async function getLatestVersion(): Promise<string | null> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'VibeManager-CLI',
        },
      }
    );

    if (response.ok) {
      const release: ReleaseInfo = await response.json();
      return release.tag_name.replace(/^v/, '');
    }
    return null;
  } catch {
    return null;
  }
}

function compareVersions(a: string, b: string): number {
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

function checkGitUpdates(sourceDir: string): { hasUpdates: boolean; localRef: string; remoteRef: string } {
  try {
    execFileSync('git', ['fetch', 'origin'], { cwd: sourceDir, stdio: 'pipe' });
    const localRef = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sourceDir, encoding: 'utf-8' }).trim();
    const remoteRef = execFileSync('git', ['rev-parse', 'origin/master'], { cwd: sourceDir, encoding: 'utf-8' }).trim();
    return {
      hasUpdates: localRef !== remoteRef,
      localRef: localRef.substring(0, 7),
      remoteRef: remoteRef.substring(0, 7),
    };
  } catch {
    return { hasUpdates: false, localRef: 'unknown', remoteRef: 'unknown' };
  }
}

export const updateCommand = new Command('update')
  .description('Update VibeManager to the latest version')
  .option('--check', 'Only check for updates, do not apply')
  .option('--force', 'Force update from git even if version check fails')
  .action(async (options) => {
    const currentVersion = getCurrentVersion();
    console.log(`Current version: v${currentVersion}`);

    console.log('Checking for updates...');
    const latestVersion = await getLatestVersion();

    // Check git updates as fallback
    const sourceDir = getSourceDir();
    let gitUpdates = { hasUpdates: false, localRef: '', remoteRef: '' };
    if (sourceDir) {
      gitUpdates = checkGitUpdates(sourceDir);
    }

    // Determine if update is available
    let hasUpdate = false;
    let updateMessage = '';

    if (latestVersion) {
      console.log(`Latest version:  v${latestVersion}`);
      hasUpdate = compareVersions(latestVersion, currentVersion) > 0;
      if (hasUpdate) {
        updateMessage = `v${currentVersion} -> v${latestVersion}`;
      }
    } else if (gitUpdates.hasUpdates) {
      console.log('No releases found, checking git...');
      console.log(`Local:  ${gitUpdates.localRef}`);
      console.log(`Remote: ${gitUpdates.remoteRef}`);
      hasUpdate = true;
      updateMessage = `${gitUpdates.localRef} -> ${gitUpdates.remoteRef} (git)`;
    } else if (options.force && sourceDir) {
      console.log('Forcing update from git...');
      hasUpdate = true;
      updateMessage = 'forced update';
    } else {
      console.log('\nNo updates available (no releases yet).');
      if (!sourceDir) {
        console.log('Source directory not found for git updates.');
      }
      return;
    }

    if (!hasUpdate) {
      console.log('\nYou are already on the latest version!');
      return;
    }

    console.log(`\nUpdate available: ${updateMessage}`);

    if (options.check) {
      console.log('\nRun `vibemanager update` to apply the update.');
      return;
    }

    if (!sourceDir) {
      console.error('\nCannot update: source directory not found.');
      console.error('Please reinstall VibeManager:');
      console.error('  curl -fsSL https://raw.githubusercontent.com/claraverse-space/VibeManager/master/install.sh | bash');
      process.exit(1);
    }

    // Check if server is running
    const wasRunning = isRunning();
    const port = 3131; // Default port

    if (wasRunning) {
      console.log('\nStopping VibeManager server...');
      stopServer();
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    try {
      // Fetch and pull latest changes
      console.log('\nFetching updates...');
      execFileSync('git', ['fetch', 'origin'], { cwd: sourceDir, stdio: 'inherit' });

      console.log('Pulling updates...');
      execFileSync('git', ['pull', 'origin', 'master'], { cwd: sourceDir, stdio: 'inherit' });

      // Install dependencies
      console.log('\nInstalling dependencies...');
      execFileSync('bun', ['install'], { cwd: sourceDir, stdio: 'inherit' });

      // Run migrations
      console.log('\nRunning database migrations...');
      execFileSync('bun', ['run', 'db:migrate'], { cwd: sourceDir, stdio: 'inherit' });

      // Rebuild frontend
      console.log('\nRebuilding frontend...');
      execFileSync('bun', ['run', '--filter', '@vibemanager/web', 'build'], { cwd: sourceDir, stdio: 'inherit' });

      // Copy frontend to server
      const webDist = join(sourceDir, 'apps', 'web', 'dist');
      const serverPublic = join(sourceDir, 'apps', 'server', 'public');
      if (existsSync(webDist)) {
        if (existsSync(serverPublic)) {
          rmSync(serverPublic, { recursive: true });
        }
        mkdirSync(serverPublic, { recursive: true });
        cpSync(webDist, serverPublic, { recursive: true });
        console.log('Frontend copied to server/public');
      }

      const newVersion = getCurrentVersion();
      console.log(`\n✓ Updated to v${newVersion}`);

      // Restart server if it was running
      if (wasRunning) {
        console.log('\nRestarting VibeManager server...');
        startServer(port);

        // Wait for server to be healthy
        let healthy = false;
        for (let i = 0; i < 30; i++) {
          await new Promise(resolve => setTimeout(resolve, 500));
          healthy = await checkHealth(port);
          if (healthy) break;
          process.stdout.write('.');
        }
        console.log('');

        if (healthy) {
          console.log(`✓ VibeManager restarted on http://localhost:${port}`);
        } else {
          console.error('Server failed to restart. Check logs for details.');
        }
      }

    } catch (error) {
      console.error('\nUpdate failed:', error);
      process.exit(1);
    }
  });
