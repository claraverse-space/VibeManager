import { Command } from 'commander';
import { isRunning, getPid, checkHealth } from '../lib/process';
import { checkAllDependencies, getDatabasePath } from '../lib/deps';
import { existsSync } from 'fs';

export const statusCommand = new Command('status')
  .description('Show VibeManager status')
  .option('-p, --port <port>', 'Server port', '3131')
  .action(async (options) => {
    const port = parseInt(options.port, 10);

    console.log('VibeManager Status\n');

    // Server status
    const running = isRunning();
    const pid = getPid();
    const healthy = running ? await checkHealth(port) : false;

    console.log('Server:');
    if (running && healthy) {
      console.log(`  Status: ✓ Running (PID: ${pid})`);
      console.log(`  URL: http://localhost:${port}`);

      // Fetch access URLs
      try {
        const response = await fetch(`http://localhost:${port}/api/system/access-urls`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data?.urls?.length > 0) {
            console.log('\nAccess URLs:');
            for (const url of data.data.urls) {
              console.log(`  ${url.label}: ${url.url}`);
            }

            if (data.data.tailscale?.connected) {
              console.log(`\nTailscale: Connected (${data.data.tailscale.ip})`);
            }
          }
        }
      } catch {
        // Ignore fetch errors
      }
    } else if (running) {
      console.log(`  Status: ⚠ Running but not responding (PID: ${pid})`);
    } else {
      console.log('  Status: ✗ Not running');
    }

    // Database status
    const dbPath = getDatabasePath();
    console.log('\nDatabase:');
    console.log(`  Path: ${dbPath}`);
    console.log(`  Exists: ${existsSync(dbPath) ? '✓' : '✗'}`);

    // Dependencies
    console.log('\nDependencies:');
    const deps = checkAllDependencies();
    for (const dep of deps) {
      const status = dep.installed ? '✓' : '✗';
      const version = dep.version ? ` (${dep.version})` : '';
      console.log(`  ${status} ${dep.name}${version}`);
    }

    // Sessions (if server is running)
    if (running && healthy) {
      try {
        const response = await fetch(`http://localhost:${port}/api/sessions`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data) {
            console.log(`\nSessions: ${data.data.length}`);
            for (const session of data.data.slice(0, 5)) {
              const status = session.alive ? '●' : '○';
              console.log(`  ${status} ${session.name} (${session.shell})`);
            }
            if (data.data.length > 5) {
              console.log(`  ... and ${data.data.length - 5} more`);
            }
          }
        }
      } catch {
        // Ignore fetch errors
      }
    }
  });
