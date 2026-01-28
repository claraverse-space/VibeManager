import { Command } from 'commander';
import { checkAllDependencies, getDataDir } from '../lib/deps';
import { startServer, checkHealth } from '../lib/process';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const CODE_SERVER_PORT = 8443;

/**
 * Configure code-server to use a port that doesn't conflict with VibeManager
 */
function configureCodeServer(vibemanagerPort: number): void {
  const configDir = join(homedir(), '.config', 'code-server');
  const configPath = join(configDir, 'config.yaml');

  // Ensure config directory exists
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  // Check if config exists and has conflicting port
  if (existsSync(configPath)) {
    const config = readFileSync(configPath, 'utf-8');
    // Check if the config has bind-addr with our port
    if (config.includes(`bind-addr: 127.0.0.1:${vibemanagerPort}`) ||
        config.includes(`bind-addr: 0.0.0.0:${vibemanagerPort}`)) {
      console.log(`\nUpdating code-server config (port conflict with ${vibemanagerPort})...`);
      const newConfig = config.replace(
        /bind-addr:\s*[\d\.]+:\d+/,
        `bind-addr: 127.0.0.1:${CODE_SERVER_PORT}`
      );
      writeFileSync(configPath, newConfig);
      console.log(`  ✓ code-server configured to use port ${CODE_SERVER_PORT}`);
    }
  } else {
    // Create a new config file
    console.log('\nCreating code-server config...');
    const config = `bind-addr: 127.0.0.1:${CODE_SERVER_PORT}
auth: none
cert: false
`;
    writeFileSync(configPath, config);
    console.log(`  ✓ code-server configured to use port ${CODE_SERVER_PORT}`);
  }
}

export const initCommand = new Command('init')
  .description('Initialize VibeManager (first-time setup)')
  .option('-p, --port <port>', 'Server port', '3131')
  .action(async (options) => {
    console.log('Initializing VibeManager...\n');

    // Check dependencies
    console.log('Checking dependencies:');
    const deps = checkAllDependencies();
    let allInstalled = true;
    let codeServerInstalled = false;

    for (const dep of deps) {
      const status = dep.installed ? '✓' : '✗';
      const version = dep.version ? ` (${dep.version})` : '';
      console.log(`  ${status} ${dep.name}${version}`);

      if (dep.name === 'code-server' && dep.installed) {
        codeServerInstalled = true;
      }

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

    const port = parseInt(options.port, 10);

    // Configure code-server if installed
    if (codeServerInstalled) {
      configureCodeServer(port);
    }

    // Create data directory
    const dataDir = getDataDir();
    if (!existsSync(dataDir)) {
      console.log(`\nCreating data directory: ${dataDir}`);
      mkdirSync(dataDir, { recursive: true });
    }

    // Run migrations (the server will run migrations on startup)
    console.log('\nRunning database migrations...');
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
