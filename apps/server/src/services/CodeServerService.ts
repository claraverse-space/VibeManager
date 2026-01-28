import { spawn, execFileSync, type ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { createServer } from 'net';

const CODE_SERVER_PREFERRED_PORT = 8443;

/**
 * Find code-server binary in common locations
 */
function findCodeServerPath(): string | null {
  const paths = [
    join(homedir(), '.local', 'bin', 'code-server'),
    '/opt/homebrew/bin/code-server',  // macOS Homebrew (Apple Silicon)
    '/usr/local/bin/code-server',      // macOS Homebrew (Intel) / Linux
    '/usr/bin/code-server',
  ];

  for (const path of paths) {
    if (existsSync(path)) {
      return path;
    }
  }

  // Fallback: try 'which' command
  try {
    const whichPath = execFileSync('which', ['code-server'], {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();

    if (whichPath && existsSync(whichPath)) {
      return whichPath;
    }
  } catch {
    // which failed
  }

  return null;
}

class CodeServerService {
  private process: ChildProcess | null = null;
  private isRunning = false;
  private actualPort: number | null = null;
  private codeServerPath: string | null = null;

  /**
   * Find an available port starting from the preferred port
   */
  private async findAvailablePort(startPort: number, maxAttempts: number = 100): Promise<number> {
    for (let i = 0; i < maxAttempts; i++) {
      const port = startPort + i;
      const isAvailable = await this.isPortAvailable(port);
      if (isAvailable) {
        return port;
      }
    }
    throw new Error(`No available port found starting from ${startPort}`);
  }

  /**
   * Check if a port is available
   */
  private isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = createServer();
      server.once('error', () => {
        resolve(false);
      });
      server.once('listening', () => {
        server.close();
        resolve(true);
      });
      server.listen(port, '127.0.0.1');
    });
  }

  /**
   * Wait for code-server to be ready by checking if port responds
   */
  private async waitForReady(port: number, maxAttempts: number = 40): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        // Just check if the server responds at all (any status code is fine)
        const response = await fetch(`http://127.0.0.1:${port}/`, {
          signal: AbortSignal.timeout(2000),
          redirect: 'manual', // Don't follow redirects
        });
        // Any response means server is up (even 302 redirect)
        console.log(`[code-server] Health check attempt ${i + 1}: status ${response.status}`);
        return true;
      } catch (err) {
        // Not ready yet - log every 5th attempt
        if (i % 5 === 0) {
          console.log(`[code-server] Waiting... attempt ${i + 1}/${maxAttempts}`);
        }
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    return false;
  }

  /**
   * Check if code-server is running on a specific port
   */
  private async checkPortRunning(port: number): Promise<boolean> {
    try {
      await fetch(`http://127.0.0.1:${port}/`, {
        signal: AbortSignal.timeout(1000),
        redirect: 'manual',
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Start code-server if not already running
   */
  async start(workspaceFolder?: string): Promise<boolean> {
    if (this.isRunning && this.process && this.actualPort) {
      console.log(`code-server already running on port ${this.actualPort}`);
      return true;
    }

    // Check if code-server exists
    this.codeServerPath = findCodeServerPath();
    if (!this.codeServerPath) {
      console.warn('code-server not found');
      return false;
    }

    // Check if code-server is already running on preferred port (external instance)
    if (await this.checkPortRunning(CODE_SERVER_PREFERRED_PORT)) {
      console.log('code-server already running externally on port', CODE_SERVER_PREFERRED_PORT);
      this.isRunning = true;
      this.actualPort = CODE_SERVER_PREFERRED_PORT;
      return true;
    }

    // Find an available port
    let port: number;
    try {
      port = await this.findAvailablePort(CODE_SERVER_PREFERRED_PORT);
      console.log(`Found available port: ${port}`);
    } catch (err) {
      console.error('Failed to find available port:', err);
      return false;
    }

    const args = [
      '--bind-addr', `127.0.0.1:${port}`,
      '--auth', 'none',  // No auth for local dev
      '--disable-telemetry',
    ];

    if (workspaceFolder) {
      args.push(workspaceFolder);
    }

    try {
      console.log(`Starting code-server: ${this.codeServerPath} ${args.join(' ')}`);

      // Remove PORT from environment so code-server doesn't try to use it
      const env = { ...process.env };
      delete env.PORT;
      env.DISABLE_UPDATE_CHECK = 'true';

      this.process = spawn(this.codeServerPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
        env,
      });

      this.process.stdout?.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg) console.log('[code-server]', msg);
      });

      this.process.stderr?.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg && !msg.includes('update')) {
          console.error('[code-server]', msg);
        }
      });

      this.process.on('error', (err) => {
        console.error('Failed to start code-server:', err);
        this.isRunning = false;
        this.actualPort = null;
      });

      this.process.on('exit', (code) => {
        console.log('code-server exited with code', code);
        this.isRunning = false;
        this.process = null;
        this.actualPort = null;
      });

      // Unref to allow parent to exit independently
      this.process.unref();

      // Wait for code-server to be ready
      console.log('Waiting for code-server to be ready...');
      const ready = await this.waitForReady(port);

      if (ready) {
        this.isRunning = true;
        this.actualPort = port;
        console.log(`code-server started on http://localhost:${port}`);
        return true;
      } else {
        console.error('code-server failed to start within timeout');
        this.stop();
        return false;
      }
    } catch (err) {
      console.error('Failed to start code-server:', err);
      return false;
    }
  }

  /**
   * Stop code-server
   */
  stop(): void {
    if (this.process) {
      console.log('Stopping code-server...');
      this.process.kill('SIGTERM');
      this.process = null;
      this.isRunning = false;
      this.actualPort = null;
    }
  }

  /**
   * Check if code-server is installed
   */
  isInstalled(): boolean {
    return findCodeServerPath() !== null;
  }

  /**
   * Get code-server status
   */
  getStatus(): { running: boolean; installed: boolean; port: number | null; url: string | null } {
    return {
      running: this.isRunning,
      installed: this.isInstalled(),
      port: this.actualPort,
      url: this.actualPort ? `http://localhost:${this.actualPort}` : null,
    };
  }

  /**
   * Get the port code-server is running on (or null if not running)
   */
  getPort(): number | null {
    return this.actualPort;
  }
}

export const codeServerService = new CodeServerService();
