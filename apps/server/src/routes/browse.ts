import { Hono } from 'hono';
import { readdirSync, statSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { DirectoryEntry } from '@vibemanager/shared';

const browse = new Hono();

// Browse directory
browse.get('/', (c) => {
  try {
    const path = c.req.query('path') || homedir();

    const entries = readdirSync(path, { withFileTypes: true });
    const result: DirectoryEntry[] = [];

    for (const entry of entries) {
      // Skip hidden files unless explicitly browsing hidden folder
      if (entry.name.startsWith('.') && !path.includes('/.')) {
        continue;
      }

      const fullPath = join(path, entry.name);
      let stats;
      try {
        stats = statSync(fullPath);
      } catch {
        continue; // Skip files we can't access
      }

      result.push({
        name: entry.name,
        path: fullPath,
        isDirectory: entry.isDirectory(),
        size: entry.isDirectory() ? undefined : stats.size,
        modifiedAt: stats.mtime,
      });
    }

    // Sort: directories first, then by name
    result.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    return c.json({ success: true, data: result, path });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 400);
  }
});

// Create directory
browse.post('/mkdir', async (c) => {
  try {
    const body = await c.req.json();
    const { path } = body;

    if (!path) {
      return c.json({ success: false, error: 'Path is required' }, 400);
    }

    mkdirSync(path, { recursive: true });
    return c.json({ success: true });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 400);
  }
});

export default browse;
