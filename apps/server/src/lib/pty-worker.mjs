#!/usr/bin/env node
// PTY worker that runs in Node.js to avoid Bun's PTY issues
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Find node-pty module - Bun installs it in .bun directory
function findNodePty() {
  const searchPaths = [
    // Standard location
    join(__dirname, '..', '..', '..', '..', 'node_modules', 'node-pty'),
    // Bun's .bun cache
    join(__dirname, '..', '..', '..', '..', 'node_modules', '.bun'),
  ];

  for (const searchPath of searchPaths) {
    if (!existsSync(searchPath)) continue;

    // Direct node-pty path
    if (searchPath.endsWith('node-pty') && existsSync(join(searchPath, 'lib', 'index.js'))) {
      return searchPath;
    }

    // Search in .bun directory for node-pty
    if (searchPath.endsWith('.bun')) {
      try {
        const entries = readdirSync(searchPath);
        for (const entry of entries) {
          if (entry.startsWith('node-pty@')) {
            const ptyPath = join(searchPath, entry, 'node_modules', 'node-pty');
            if (existsSync(join(ptyPath, 'lib', 'index.js'))) {
              return ptyPath;
            }
          }
        }
      } catch (e) {
        // Ignore read errors
      }
    }
  }

  // Fallback to standard require resolution
  return 'node-pty';
}

const ptyPath = findNodePty();
const require = createRequire(import.meta.url);
const pty = require(ptyPath);

const [,, tmuxSession, cols, rows, tmuxPath] = process.argv;

const terminal = pty.spawn(tmuxPath || '/usr/bin/tmux', ['-u', 'attach-session', '-t', tmuxSession], {
  name: 'xterm-256color',
  cols: parseInt(cols) || 120,
  rows: parseInt(rows) || 30,
  env: { ...process.env, TERM: 'xterm-256color' },
});

// Send data from terminal to stdout as JSON
terminal.onData((data) => {
  process.stdout.write(JSON.stringify({ type: 'data', data }) + '\n');
});

terminal.onExit(({ exitCode }) => {
  process.stdout.write(JSON.stringify({ type: 'exit', code: exitCode }) + '\n');
  process.exit(exitCode);
});

// Read input from stdin as JSON
process.stdin.setEncoding('utf8');
let buffer = '';
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      switch (msg.type) {
        case 'data':
          terminal.write(msg.data);
          break;
        case 'resize':
          terminal.resize(msg.cols, msg.rows);
          break;
      }
    } catch (e) {
      // Ignore parse errors
    }
  }
});

process.stdin.on('end', () => {
  terminal.kill();
  process.exit(0);
});
