#!/usr/bin/env node
// PTY worker that runs in Node.js to avoid Bun's PTY issues
import * as pty from 'node-pty';

const [,, tmuxSession, cols, rows] = process.argv;

const terminal = pty.spawn('/usr/bin/tmux', ['-u', 'attach-session', '-t', tmuxSession], {
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
