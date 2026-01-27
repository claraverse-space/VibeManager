import { Command } from 'commander';
import { startServer, checkHealth, isRunning } from '../lib/process';

export const startCommand = new Command('start')
  .description('Start the VibeManager server')
  .option('-p, --port <port>', 'Server port', '3131')
  .action(async (options) => {
    const port = parseInt(options.port, 10);

    if (isRunning()) {
      console.log('VibeManager is already running');
      console.log(`Check status with: vibemanager status`);
      return;
    }

    console.log(`Starting VibeManager on port ${port}...`);

    const child = startServer(port);
    if (!child) {
      console.error('Failed to start server');
      process.exit(1);
    }

    // Wait for server to be healthy
    let healthy = false;
    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 500));
      healthy = await checkHealth(port);
      if (healthy) break;
      process.stdout.write('.');
    }
    console.log('');

    if (!healthy) {
      console.error('Server failed to start. Check logs for details.');
      process.exit(1);
    }

    console.log(`✓ VibeManager started on http://localhost:${port}`);
  });
