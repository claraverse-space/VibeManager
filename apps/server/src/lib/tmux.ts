import { execFileSync, spawnSync } from 'child_process';
import { findTmux } from './tools';
import { TMUX_PREFIX, DEFAULT_COLS, DEFAULT_ROWS } from '@vibemanager/shared';

const TMUX = findTmux();

/**
 * Create a new tmux session
 */
export function createTmuxSession(
  name: string,
  cwd: string,
  command: string,
  cols = DEFAULT_COLS,
  rows = DEFAULT_ROWS
): void {
  const tmuxName = `${TMUX_PREFIX}${name}`;

  // Create a detached session with specified dimensions
  execFileSync(TMUX, [
    'new-session',
    '-d',
    '-s', tmuxName,
    '-c', cwd,
    '-x', String(cols),
    '-y', String(rows),
    command,
  ], { stdio: 'ignore' });
}

/**
 * Kill a tmux session
 */
export function killTmuxSession(name: string): void {
  const tmuxName = `${TMUX_PREFIX}${name}`;
  try {
    execFileSync(TMUX, ['kill-session', '-t', tmuxName], { stdio: 'ignore' });
  } catch {
    // Session might not exist, ignore error
  }
}

/**
 * Check if a tmux session exists and is alive
 */
export function isTmuxSessionAlive(name: string): boolean {
  const tmuxName = `${TMUX_PREFIX}${name}`;
  try {
    const result = spawnSync(TMUX, ['has-session', '-t', tmuxName], { stdio: 'ignore' });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * List all tmux sessions with our prefix
 */
export function listTmuxSessions(): string[] {
  try {
    const result = execFileSync(TMUX, ['list-sessions', '-F', '#{session_name}'], {
      encoding: 'utf8',
    });
    return result
      .trim()
      .split('\n')
      .filter((s) => s.startsWith(TMUX_PREFIX))
      .map((s) => s.slice(TMUX_PREFIX.length));
  } catch {
    return [];
  }
}

/**
 * Send keys to a tmux session
 */
export function sendKeys(name: string, keys: string): void {
  const tmuxName = `${TMUX_PREFIX}${name}`;
  execFileSync(TMUX, ['send-keys', '-t', tmuxName, keys, 'Enter'], { stdio: 'ignore' });
}

/**
 * Capture scrollback from a tmux session
 */
export function captureScrollback(name: string, lines = 10000): string {
  const tmuxName = `${TMUX_PREFIX}${name}`;
  try {
    return execFileSync(TMUX, [
      'capture-pane',
      '-t', tmuxName,
      '-p',
      '-S', `-${lines}`,
    ], { encoding: 'utf8' });
  } catch {
    return '';
  }
}

/**
 * Capture recent output from a tmux session (for activity detection)
 */
export function captureRecentOutput(name: string, lines = 10): string | null {
  const tmuxName = `${TMUX_PREFIX}${name}`;
  try {
    const result = spawnSync(TMUX, [
      'capture-pane',
      '-t', tmuxName,
      '-p',
      '-S', `-${lines}`,
    ], { encoding: 'utf8' });
    if (result.status === 0) {
      return result.stdout;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get tmux session full name
 */
export function getTmuxSessionName(name: string): string {
  return `${TMUX_PREFIX}${name}`;
}
