import { spawn, type ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const CODE_SERVER_PORT = 8443;
const CODE_SERVER_PATH = join(homedir(), '.local', 'bin', 'code-server');

class CodeServerService {
  private process: ChildProcess | null = null;
  private isRunning = false;

  /**
   * Start code-server if not already running
   */
  async start(workspaceFolder?: string): Promise<boolean> {
    if (this.isRunning) {
      console.log('code-server already running');
      return true;
    }

    // Check if code-server exists
    if (!existsSync(CODE_SERVER_PATH)) {
      console.warn('code-server not found at', CODE_SERVER_PATH);
      return false;
    }

    const args = [
      '--bind-addr', `127.0.0.1:${CODE_SERVER_PORT}`,
      '--auth', 'none',  // No auth for local dev
      '--disable-telemetry',
    ];

    if (workspaceFolder) {
      args.push(workspaceFolder);
    }

    try {
      this.process = spawn(CODE_SERVER_PATH, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
        env: {
          ...process.env,
          // Disable update checks
          DISABLE_UPDATE_CHECK: 'true',
        },
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
      });

      this.process.on('exit', (code) => {
        console.log('code-server exited with code', code);
        this.isRunning = false;
        this.process = null;
      });

      this.isRunning = true;
      console.log(`code-server starting on http://localhost:${CODE_SERVER_PORT}`);
      return true;
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
    }
  }

  /**
   * Get code-server status
   */
  getStatus(): { running: boolean; port: number; url: string } {
    return {
      running: this.isRunning,
      port: CODE_SERVER_PORT,
      url: `http://localhost:${CODE_SERVER_PORT}`,
    };
  }

  /**
   * Get the port code-server is running on
   */
  getPort(): number {
    return CODE_SERVER_PORT;
  }
}

export const codeServerService = new CodeServerService();
