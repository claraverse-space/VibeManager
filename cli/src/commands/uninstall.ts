import { Command } from 'commander';
import { stopServer, isRunning, getPid } from '../lib/process';
import { getDataDir } from '../lib/deps';
import { existsSync, rmSync } from 'fs';
import { execFileSync } from 'child_process';
import { createInterface } from 'readline';

const TMUX_SESSION_PREFIX = 'pg_';

/**
 * Kill all VibeManager tmux sessions
 */
function killTmuxSessions(): number {
  let killed = 0;
  try {
    // List all tmux sessions
    const output = execFileSync('tmux', ['list-sessions', '-F', '#{session_name}'], {
      encoding: 'utf-8',
      timeout: 5000,
    });

    const sessions = output.trim().split('\n').filter(s => s.startsWith(TMUX_SESSION_PREFIX));

    for (const session of sessions) {
      try {
        execFileSync('tmux', ['kill-session', '-t', session], { timeout: 5000 });
        killed++;
      } catch {
        // Session might already be dead
      }
    }
  } catch {
    // tmux not running or no sessions
  }
  return killed;
}

/**
 * Prompt user for confirmation
 */
async function confirm(message: string): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

export const uninstallCommand = new Command('uninstall')
  .description('Uninstall VibeManager and remove all data')
  .option('-y, --yes', 'Skip confirmation prompt')
  .option('--keep-data', 'Keep database and session data')
  .action(async (options) => {
    const dataDir = getDataDir();

    console.log('\nVibeManager Uninstall');
    console.log('=====================\n');
    console.log('This will:');
    console.log('  • Stop the VibeManager server');
    console.log('  • Kill all VibeManager tmux sessions');
    if (!options.keepData) {
      console.log(`  • Remove data directory: ${dataDir}`);
    }
    console.log('');

    // Confirm unless -y flag is passed
    if (!options.yes) {
      const confirmed = await confirm('Are you sure you want to uninstall?');
      if (!confirmed) {
        console.log('Uninstall cancelled.');
        return;
      }
    }

    console.log('');

    // Stop the server if running
    if (isRunning()) {
      const pid = getPid();
      console.log(`Stopping VibeManager server (PID: ${pid})...`);
      stopServer();
      console.log('  ✓ Server stopped');
    } else {
      console.log('  • Server not running');
    }

    // Kill tmux sessions
    console.log('Killing VibeManager tmux sessions...');
    const killed = killTmuxSessions();
    if (killed > 0) {
      console.log(`  ✓ Killed ${killed} session(s)`);
    } else {
      console.log('  • No sessions found');
    }

    // Remove data directory
    if (!options.keepData) {
      if (existsSync(dataDir)) {
        console.log(`Removing data directory: ${dataDir}...`);
        try {
          rmSync(dataDir, { recursive: true, force: true });
          console.log('  ✓ Data directory removed');
        } catch (err) {
          console.error(`  ✗ Failed to remove data directory: ${err}`);
        }
      } else {
        console.log('  • Data directory does not exist');
      }
    } else {
      console.log('  • Keeping data directory (--keep-data)');
    }

    console.log('\n✓ VibeManager uninstalled successfully!\n');
    console.log('To reinstall, run: vibemanager init');
  });
