import { eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { resolveShell } from '../lib/tools';
import {
  createTmuxSession,
  killTmuxSession,
  isTmuxSessionAlive,
  listTmuxSessions,
  captureScrollback,
  getTmuxSessionName,
  sendKeys,
} from '../lib/tmux';
import type { Session, ShellType, CreateSessionInput } from '@vibemanager/shared';
import { existsSync } from 'fs';

/**
 * Service for managing terminal sessions
 */
export class SessionService {
  /**
   * Create a new session
   */
  async create(input: CreateSessionInput): Promise<Session> {
    const { name, projectPath, shell = 'auto', initialPrompt, autonomous = true } = input;

    // Validate name doesn't exist
    const existing = await db.query.sessions.findFirst({
      where: eq(schema.sessions.name, name),
    });
    if (existing) {
      throw new Error(`Session '${name}' already exists`);
    }

    // Validate project path exists
    if (!existsSync(projectPath)) {
      throw new Error(`Project path '${projectPath}' does not exist`);
    }

    // Resolve shell and get tool path
    const resolved = resolveShell(shell);

    // Generate IDs
    const id = crypto.randomUUID();
    const tmuxSession = getTmuxSessionName(name);
    const now = new Date();

    // Build the command to run
    let command = resolved.path;
    if (resolved.shell === 'claude' && autonomous) {
      command = `${resolved.path} --dangerously-skip-permissions`;
    }
    if (resolved.shell === 'kimi' && autonomous) {
      command = `${resolved.path} -y`;
    }

    // Create tmux session
    createTmuxSession(name, projectPath, command);

    // Send initial prompt if provided (after a delay for tool startup)
    if (initialPrompt) {
      setTimeout(() => {
        try {
          sendKeys(name, initialPrompt);
        } catch {
          // Ignore errors sending initial prompt
        }
      }, 5000);
    }

    // Insert into database
    const session: typeof schema.sessions.$inferInsert = {
      id,
      name,
      projectPath,
      tmuxSession,
      shell: resolved.shell,
      autonomous,
      initialPrompt: initialPrompt || null,
      createdAt: now,
      lastAccessedAt: now,
    };

    await db.insert(schema.sessions).values(session);

    return {
      ...session,
      createdAt: now,
      lastAccessedAt: now,
      alive: true,
    } as Session;
  }

  /**
   * Get a session by name or ID
   */
  async get(nameOrId: string): Promise<(Session & { alive: boolean }) | null> {
    const session = await db.query.sessions.findFirst({
      where: (s, { or, eq }) => or(eq(s.name, nameOrId), eq(s.id, nameOrId)),
    });

    if (!session) return null;

    const alive = isTmuxSessionAlive(session.name);
    return { ...session, alive } as Session & { alive: boolean };
  }

  /**
   * List all sessions
   */
  async list(): Promise<Array<Session & { alive: boolean }>> {
    const sessions = await db.query.sessions.findMany({
      orderBy: (s, { desc }) => [desc(s.lastAccessedAt)],
    });

    // Get live tmux sessions
    const liveSessions = new Set(listTmuxSessions());

    return sessions.map((s) => ({
      ...s,
      alive: liveSessions.has(s.name),
    })) as Array<Session & { alive: boolean }>;
  }

  /**
   * Delete a session
   */
  async delete(nameOrId: string): Promise<void> {
    const session = await this.get(nameOrId);
    if (!session) {
      throw new Error(`Session '${nameOrId}' not found`);
    }

    // Kill tmux session if alive
    if (session.alive) {
      killTmuxSession(session.name);
    }

    // Delete from database (cascades to snapshots)
    await db.delete(schema.sessions).where(eq(schema.sessions.id, session.id));
  }

  /**
   * Stop a session (kill tmux but keep in db)
   */
  async stop(nameOrId: string): Promise<void> {
    const session = await this.get(nameOrId);
    if (!session) {
      throw new Error(`Session '${nameOrId}' not found`);
    }

    killTmuxSession(session.name);
  }

  /**
   * Revive a stopped session
   */
  async revive(nameOrId: string): Promise<Session & { alive: boolean }> {
    const session = await this.get(nameOrId);
    if (!session) {
      throw new Error(`Session '${nameOrId}' not found`);
    }

    if (session.alive) {
      return session;
    }

    // Resolve shell again
    const resolved = resolveShell(session.shell);
    let command = resolved.path;
    if (resolved.shell === 'claude' && session.autonomous) {
      command = `${resolved.path} --dangerously-skip-permissions`;
    }
    if (resolved.shell === 'kimi' && session.autonomous) {
      command = `${resolved.path} -y`;
    }

    // Recreate tmux session
    createTmuxSession(session.name, session.projectPath, command);

    // Update last accessed time
    await this.touch(session.id);

    return { ...session, alive: true };
  }

  /**
   * Update last accessed time
   */
  async touch(nameOrId: string): Promise<void> {
    const session = await this.get(nameOrId);
    if (!session) return;

    await db
      .update(schema.sessions)
      .set({ lastAccessedAt: new Date() })
      .where(eq(schema.sessions.id, session.id));
  }

  /**
   * Update preview port for a session
   */
  async setPreviewPort(nameOrId: string, port: number | null): Promise<void> {
    const session = await this.get(nameOrId);
    if (!session) {
      throw new Error(`Session '${nameOrId}' not found`);
    }

    await db
      .update(schema.sessions)
      .set({ previewPort: port })
      .where(eq(schema.sessions.id, session.id));
  }

  /**
   * Get the last active session
   */
  async getLastActive(): Promise<(Session & { alive: boolean }) | null> {
    const session = await db.query.sessions.findFirst({
      orderBy: (s, { desc }) => [desc(s.lastAccessedAt)],
    });

    if (!session) return null;

    const alive = isTmuxSessionAlive(session.name);
    return { ...session, alive } as Session & { alive: boolean };
  }

  /**
   * Capture and save scrollback
   */
  async saveScrollback(nameOrId: string): Promise<void> {
    const session = await this.get(nameOrId);
    if (!session || !session.alive) return;

    const scrollback = captureScrollback(session.name);
    if (!scrollback) return;

    await db.insert(schema.sessionSnapshots).values({
      id: crypto.randomUUID(),
      sessionId: session.id,
      scrollback,
      capturedAt: new Date(),
    });
  }

  /**
   * Get latest scrollback for a session
   */
  async getScrollback(nameOrId: string): Promise<string | null> {
    const session = await this.get(nameOrId);
    if (!session) return null;

    // If alive, capture live
    if (session.alive) {
      return captureScrollback(session.name);
    }

    // Otherwise get from database
    const snapshot = await db.query.sessionSnapshots.findFirst({
      where: eq(schema.sessionSnapshots.sessionId, session.id),
      orderBy: (s, { desc }) => [desc(s.capturedAt)],
    });

    return snapshot?.scrollback || null;
  }
}

// Export singleton instance
export const sessionService = new SessionService();
