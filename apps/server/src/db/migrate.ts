import { Database } from 'bun:sqlite';
import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { homedir } from 'os';

// Get data directory
const dataDir = join(homedir(), '.local', 'share', 'vibemanager');
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

const dbPath = join(dataDir, 'vibemanager.db');
const sqlite = new Database(dbPath);

// Run migrations
console.log('Running database migrations...');
console.log(`Database path: ${dbPath}`);

sqlite.run('PRAGMA journal_mode = WAL');
sqlite.run('PRAGMA foreign_keys = ON');

// Create sessions table
sqlite.run(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    project_path TEXT NOT NULL,
    tmux_session TEXT NOT NULL,
    shell TEXT NOT NULL CHECK (shell IN ('opencode', 'claude', 'bash')),
    autonomous INTEGER NOT NULL DEFAULT 1,
    initial_prompt TEXT,
    created_at INTEGER NOT NULL,
    last_accessed_at INTEGER NOT NULL
  )
`);

// Create session_snapshots table
sqlite.run(`
  CREATE TABLE IF NOT EXISTS session_snapshots (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    scrollback TEXT,
    captured_at INTEGER NOT NULL
  )
`);

// Create settings table
sqlite.run(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )
`);

// Create indexes
sqlite.run(`CREATE INDEX IF NOT EXISTS idx_sessions_name ON sessions(name)`);
sqlite.run(`CREATE INDEX IF NOT EXISTS idx_session_snapshots_session_id ON session_snapshots(session_id)`);

// Migration: Add preview_port column if it doesn't exist
try {
  sqlite.run(`ALTER TABLE sessions ADD COLUMN preview_port INTEGER`);
  console.log('Added preview_port column to sessions table');
} catch {
  // Column already exists, ignore
}

// Create users table
sqlite.run(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_login_at INTEGER
  )
`);

// Create auth_sessions table
sqlite.run(`
  CREATE TABLE IF NOT EXISTS auth_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  )
`);

// Create indexes for auth tables
sqlite.run(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`);
sqlite.run(`CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id)`);
sqlite.run(`CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at)`);

sqlite.close();
console.log('Migrations complete!');
