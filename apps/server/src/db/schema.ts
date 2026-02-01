import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// Sessions table
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  projectPath: text('project_path').notNull(),
  tmuxSession: text('tmux_session').notNull(),
  shell: text('shell', { enum: ['opencode', 'claude', 'bash'] }).notNull(),
  autonomous: integer('autonomous', { mode: 'boolean' }).notNull().default(true),
  initialPrompt: text('initial_prompt'),
  previewPort: integer('preview_port'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  lastAccessedAt: integer('last_accessed_at', { mode: 'timestamp' }).notNull(),
});

// Session snapshots table (for scrollback)
export const sessionSnapshots = sqliteTable('session_snapshots', {
  id: text('id').primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  scrollback: text('scrollback'),
  capturedAt: integer('captured_at', { mode: 'timestamp' }).notNull(),
});

// Settings table (key-value store)
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// Users table (for authentication)
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  lastLoginAt: integer('last_login_at', { mode: 'timestamp' }),
});

// Auth sessions table (login sessions, not terminal sessions)
export const authSessions = sqliteTable('auth_sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
});

// Tasks table (for Ralph Loop and task automation)
export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  prompt: text('prompt').notNull(),
  runnerType: text('runner_type', { enum: ['ralph', 'simple', 'manual'] }).notNull().default('ralph'),
  status: text('status', { enum: ['pending', 'queued', 'running', 'paused', 'completed', 'failed', 'cancelled'] }).notNull().default('pending'),
  currentIteration: integer('current_iteration').notNull().default(0),
  maxIterations: integer('max_iterations').notNull().default(10),
  verificationPrompt: text('verification_prompt'),
  lastVerificationResult: text('last_verification_result'),
  statusMessage: text('status_message'),
  result: text('result'),
  error: text('error'),
  queuePosition: integer('queue_position'),  // Position in queue (null = not queued)
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  lastProgressAt: integer('last_progress_at', { mode: 'timestamp' }),  // Watchdog: last activity timestamp
  healthCheckFailures: integer('health_check_failures').notNull().default(0),  // Watchdog: consecutive failures
});

// Type exports
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type SessionSnapshot = typeof sessionSnapshots.$inferSelect;
export type NewSessionSnapshot = typeof sessionSnapshots.$inferInsert;
export type Setting = typeof settings.$inferSelect;
export type NewSetting = typeof settings.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type AuthSession = typeof authSessions.$inferSelect;
export type NewAuthSession = typeof authSessions.$inferInsert;
export type TaskRecord = typeof tasks.$inferSelect;
export type NewTaskRecord = typeof tasks.$inferInsert;
