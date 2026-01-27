import { Command } from 'commander';
import { checkAllDependencies, getDataDir } from '../lib/deps';
import { startServer, checkHealth } from '../lib/process';
import { existsSync, mkdirSync } from 'fs';

export const initCommand = new Command('init')
  .description('Initialize VibeManager (first-time setup)')
  .option('-p, --port <port>', 'Server port', '3131')
  .action(async (options) => {
    console.log('Initializing VibeManager...\n');

    // Check dependencies
    console.log('Checking dependencies:');
    const deps = checkAllDependencies();
    let allInstalled = true;

    for (const dep of deps) {
      const status = dep.installed ? '✓' : '✗';
      const version = dep.version ? ` (${dep.version})` : '';
      console.log(`  ${status} ${dep.name}${version}`);

      if (!dep.installed && dep.name !== 'code-server') {
        allInstalled = false;
      }
    }

    if (!allInstalled) {
      console.log('\nMissing required dependencies. Please install:');
      for (const dep of deps) {
        if (!dep.installed && dep.name !== 'code-server') {
          console.log(`  - ${dep.name}`);
        }
      }
      process.exit(1);
    }

    // Create data directory
    const dataDir = getDataDir();
    if (!existsSync(dataDir)) {
      console.log(`\nCreating data directory: ${dataDir}`);
      mkdirSync(dataDir, { recursive: true });
    }

    // Run migrations (the server will run migrations on startup)
    console.log('\nRunning database migrations...');
    const port = parseInt(options.port, 10);
    console.log(`\nStarting VibeManager on port ${port}...`);

    const child = startServer(port);
    if (!child) {
      console.error('Failed to start server');
      process.exit(1);
    }

    // Wait for server to be healthy
    console.log('Waiting for server to be ready...');
    let healthy = false;
    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 500));
      healthy = await checkHealth(port);
      if (healthy) break;
    }

    if (!healthy) {
      console.error('Server failed to start. Check logs for details.');
      process.exit(1);
    }

    console.log('\n✓ VibeManager initialized successfully!\n');
    console.log('Next steps:');
    console.log(`  1. Open http://localhost:${port} in your browser`);
    console.log('  2. Create your admin account');
    console.log('  3. Start creating sessions!\n');
    console.log('Commands:');
    console.log('  vibemanager status  - Check server status');
    console.log('  vibemanager stop    - Stop the server');
    console.log('  vibemanager start   - Start the server');
  });
