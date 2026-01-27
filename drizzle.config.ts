import { defineConfig } from 'drizzle-kit';
import { join } from 'path';
import { homedir } from 'os';

const dbPath = join(homedir(), '.local', 'share', 'vibemanager', 'vibemanager.db');

export default defineConfig({
  schema: './apps/server/src/db/schema.ts',
  out: './apps/server/src/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: dbPath,
  },
});
