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

// Create tasks table
sqlite.run(`
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    prompt TEXT NOT NULL,
    runner_type TEXT NOT NULL DEFAULT 'ralph' CHECK (runner_type IN ('ralph', 'simple', 'manual')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'paused', 'completed', 'failed', 'cancelled')),
    current_iteration INTEGER NOT NULL DEFAULT 0,
    max_iterations INTEGER NOT NULL DEFAULT 10,
    verification_prompt TEXT,
    last_verification_result TEXT,
    result TEXT,
    error TEXT,
    created_at INTEGER NOT NULL,
    started_at INTEGER,
    completed_at INTEGER
  )
`);

// Create indexes for tasks
sqlite.run(`CREATE INDEX IF NOT EXISTS idx_tasks_session_id ON tasks(session_id)`);
sqlite.run(`CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`);

// Migration: Add status_message column to tasks if it doesn't exist
try {
  sqlite.run(`ALTER TABLE tasks ADD COLUMN status_message TEXT`);
  console.log('Added status_message column to tasks table');
} catch {
  // Column already exists, ignore
}

// Migration: Add queue_position column to tasks if it doesn't exist
try {
  sqlite.run(`ALTER TABLE tasks ADD COLUMN queue_position INTEGER`);
  console.log('Added queue_position column to tasks table');
} catch {
  // Column already exists, ignore
}

// Note: SQLite doesn't support modifying CHECK constraints easily
// The 'queued' status will work since SQLite CHECK is not strictly enforced on ALTER

// Migration: Add watchdog columns to tasks (for bulletproof task monitoring)
try {
  sqlite.run(`ALTER TABLE tasks ADD COLUMN last_progress_at INTEGER`);
  console.log('Added last_progress_at column to tasks table (watchdog)');
} catch {
  // Column already exists, ignore
}

try {
  sqlite.run(`ALTER TABLE tasks ADD COLUMN health_check_failures INTEGER NOT NULL DEFAULT 0`);
  console.log('Added health_check_failures column to tasks table (watchdog)');
} catch {
  // Column already exists, ignore
}

// Create index for efficient watchdog queries
sqlite.run(`CREATE INDEX IF NOT EXISTS idx_tasks_last_progress ON tasks(last_progress_at)`);

sqlite.close();
console.log('Migrations complete!');
