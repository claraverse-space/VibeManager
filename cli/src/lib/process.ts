import { execFileSync, spawn, type ChildProcess } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';

const PID_FILE = join(homedir(), '.local', 'share', 'vibemanager', 'vibemanager.pid');

/**
 * Get the path to the server entry point
 */
export function getServerPath(): string {
  // In development, use the source directly
  // In production (binary), this would be bundled
  const devPath = join(dirname(import.meta.dir), '..', 'apps', 'server', 'src', 'index.ts');
  const prodPath = join(dirname(import.meta.dir), 'server', 'index.js');

  if (existsSync(devPath)) {
    return devPath;
  }
  return prodPath;
}

/**
 * Check if VibeManager is running
 */
export function isRunning(): boolean {
  if (!existsSync(PID_FILE)) {
    return false;
  }

  try {
    const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);
    // Check if process is running by sending signal 0
    process.kill(pid, 0);
    return true;
  } catch {
    // Process not running, clean up stale PID file
    return false;
  }
}

/**
 * Get the PID of the running server
 */
export function getPid(): number | null {
  if (!existsSync(PID_FILE)) {
    return null;
  }

  try {
    return parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);
  } catch {
    return null;
  }
}

/**
 * Start the VibeManager server
 */
export function startServer(port: number = 3131): ChildProcess | null {
  if (isRunning()) {
    console.log('VibeManager is already running');
    return null;
  }

  const serverPath = getServerPath();
  if (!existsSync(serverPath)) {
    console.error(`Server not found at ${serverPath}`);
    return null;
  }

  // Ensure PID file directory exists
  const pidDir = dirname(PID_FILE);
  if (!existsSync(pidDir)) {
    mkdirSync(pidDir, { recursive: true });
  }

  // Start the server as a detached process
  const child = spawn('bun', ['run', serverPath], {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PORT: String(port),
    },
  });

  // Write PID file
  if (child.pid) {
    writeFileSync(PID_FILE, String(child.pid));
  }

  // Unref to allow this process to exit
  child.unref();

  return child;
}

/**
 * Stop the VibeManager server
 */
export function stopServer(): boolean {
  const pid = getPid();
  if (!pid) {
    console.log('VibeManager is not running');
    return false;
  }

  try {
    process.kill(pid, 'SIGTERM');

    // Remove PID file
    try {
      if (existsSync(PID_FILE)) {
        execFileSync('rm', [PID_FILE]);
      }
    } catch {
      // Ignore
    }

    return true;
  } catch (error) {
    console.error('Failed to stop server:', error);
    return false;
  }
}

/**
 * Check server health
 */
export async function checkHealth(port: number = 3131): Promise<boolean> {
  try {
    const response = await fetch(`http://localhost:${port}/api/health`);
    return response.ok;
  } catch {
    return false;
  }
}
