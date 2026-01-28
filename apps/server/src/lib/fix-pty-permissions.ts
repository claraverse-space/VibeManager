import { chmodSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

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

  const possiblePaths = [
    // Bun's module cache location
    join(process.cwd(), 'node_modules', '.bun'),
    // Standard node_modules
    join(process.cwd(), 'node_modules', 'node-pty', 'prebuilds'),
    // Workspace root
    join(process.cwd(), '..', '..', 'node_modules', '.bun'),
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
