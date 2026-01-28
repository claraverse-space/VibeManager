import { chmodSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

// Get the directory of this file reliably
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Fix node-pty spawn-helper permissions on macOS
 * 
 * When Bun installs node-pty, the prebuilt spawn-helper binary may not have
 * execute permissions, causing posix_spawnp to fail on macOS.
 */
export function fixPtyPermissions(): void {
  // Only needed on macOS/Darwin
  if (process.platform !== 'darwin') {
    return;
  }

  // Calculate project root from this file's location
  // This file is at: <root>/apps/server/src/lib/fix-pty-permissions.ts
  const projectRoot = join(__dirname, '..', '..', '..', '..');
  
  const possiblePaths = [
    // Project root node_modules (most reliable)
    join(projectRoot, 'node_modules', '.bun'),
    join(projectRoot, 'node_modules', 'node-pty', 'prebuilds'),
    // Installed location
    join(homedir(), '.local', 'share', 'vibemanager', 'source', 'node_modules', '.bun'),
    // Fallback to cwd-based paths
    join(process.cwd(), 'node_modules', '.bun'),
    join(process.cwd(), 'node_modules', 'node-pty', 'prebuilds'),
  ];

  for (const basePath of possiblePaths) {
    if (!existsSync(basePath)) continue;

    try {
      // Find node-pty directories
      const findSpawnHelper = (dir: string): void => {
        if (!existsSync(dir)) return;
        
        const entries = readdirSync(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          
          if (entry.isDirectory()) {
            // Check for prebuilds/darwin-*/spawn-helper
            if (entry.name === 'prebuilds') {
              const darwinDirs = ['darwin-arm64', 'darwin-x64'];
              for (const darwinDir of darwinDirs) {
                const spawnHelper = join(fullPath, darwinDir, 'spawn-helper');
                if (existsSync(spawnHelper)) {
                  fixExecutePermission(spawnHelper);
                }
              }
            } else if (entry.name.includes('node-pty')) {
              findSpawnHelper(fullPath);
            } else if (entry.name === 'node_modules') {
              findSpawnHelper(fullPath);
            }
          }
        }
      };

      findSpawnHelper(basePath);
    } catch (error) {
      // Ignore errors - best effort fix
      console.warn('Warning: Could not fix PTY permissions:', error);
    }
  }
}

function fixExecutePermission(filePath: string): void {
  try {
    const stats = statSync(filePath);
    const mode = stats.mode;
    
    // Check if execute bit is missing for owner
    if ((mode & 0o100) === 0) {
      // Add execute permissions (owner, group, others)
      const newMode = mode | 0o111;
      chmodSync(filePath, newMode);
      console.log(`Fixed execute permission for: ${filePath}`);
    }
  } catch (error) {
    // Ignore individual file errors
  }
}
