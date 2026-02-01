import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { TOOL_SEARCH_PATHS } from '@vibemanager/shared';
import type { ShellType } from '@vibemanager/shared';

// Additional paths to search for tools
const EXTRA_TOOL_PATHS = [
  join(homedir(), '.opencode', 'bin'),
  join(homedir(), '.claude', 'bin'),
  join(homedir(), '.local', 'bin'),
];

/**
 * Find a tool binary by name
 */
export function findTool(name: string): string | null {
  // Try 'which' command first (safe since name is validated)
  try {
    const result = execFileSync('which', [name], { encoding: 'utf8', timeout: 5000 });
    const path = result.trim();
    if (path && existsSync(path)) {
      return path;
    }
  } catch {
    // which failed, try manual search
  }

  // Search common paths
  const allPaths = [...TOOL_SEARCH_PATHS, ...EXTRA_TOOL_PATHS];
  for (const basePath of allPaths) {
    const fullPath = join(basePath, name);
    if (existsSync(fullPath)) {
      return fullPath;
    }
  }

  return null;
}

/**
 * Determine which shell to use based on preference and availability
 */
export function resolveShell(shell: ShellType | 'auto'): { shell: ShellType; path: string } {
  if (shell === 'auto') {
    // Try opencode first
    const opencodePath = findTool('opencode');
    if (opencodePath) {
      return { shell: 'opencode', path: opencodePath };
    }

    // Try claude
    const claudePath = findTool('claude');
    if (claudePath) {
      return { shell: 'claude', path: claudePath };
    }

    // Try kimi
    const kimiPath = findTool('kimi-cli') || findTool('kimi');
    if (kimiPath) {
      return { shell: 'kimi', path: kimiPath };
    }

    // Fall back to bash
    const bashPath = findTool('bash') || '/bin/bash';
    return { shell: 'bash', path: bashPath };
  }

  // Explicit shell selection
  const toolPath = findTool(shell);
  if (!toolPath) {
    throw new Error(`Tool '${shell}' not found`);
  }

  return { shell, path: toolPath };
}

/**
 * Find tmux binary
 */
export function findTmux(): string {
  const tmuxPath = findTool('tmux');
  if (!tmuxPath) {
    throw new Error('tmux is required but not found');
  }
  return tmuxPath;
}

/**
 * Check if a tool is available
 */
export function isToolAvailable(name: string): boolean {
  return findTool(name) !== null;
}

/**
 * Get available shells
 */
export function getAvailableShells(): ShellType[] {
  const shells: ShellType[] = [];
  if (isToolAvailable('opencode')) shells.push('opencode');
  if (isToolAvailable('claude')) shells.push('claude');
  if (isToolAvailable('kimi-cli') || isToolAvailable('kimi')) shells.push('kimi');
  if (isToolAvailable('bash')) shells.push('bash');
  return shells;
}
