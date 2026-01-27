import { Command } from 'commander';
import { stopServer, isRunning, getPid } from '../lib/process';

export const stopCommand = new Command('stop')
  .description('Stop the VibeManager server')
  .action(async () => {
    if (!isRunning()) {
      console.log('VibeManager is not running');
      return;
    }

    const pid = getPid();
    console.log(`Stopping VibeManager (PID: ${pid})...`);

    const stopped = stopServer();
    if (stopped) {
      console.log('✓ VibeManager stopped');
    } else {
      console.error('Failed to stop VibeManager');
      process.exit(1);
    }
  });
