import { eq, and, gt, lt } from 'drizzle-orm';
import { db, schema } from '../db';
import type { User, AuthSession } from '../db/schema';

/**
 * Service for user authentication and session management
 */
export class AuthService {
  private static SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

  /**
   * Check if initial setup is required (no users exist)
   */
  async isSetupRequired(): Promise<boolean> {
    const user = await db.query.users.findFirst();
    return !user;
  }

  /**
   * Create a new user (for initial setup or admin creation)
   */
  async createUser(username: string, password: string): Promise<User> {
    // Validate username
    if (!username || username.length < 3) {
      throw new Error('Username must be at least 3 characters');
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      throw new Error('Username can only contain letters, numbers, underscores, and hyphens');
    }

    // Validate password
    if (!password || password.length < 6) {
      throw new Error('Password must be at least 6 characters');
    }

    // Check if username exists
    const existing = await db.query.users.findFirst({
      where: eq(schema.users.username, username),
    });
    if (existing) {
      throw new Error('Username already exists');
    }

    // Hash password using Bun's built-in bcrypt
    const passwordHash = await Bun.password.hash(password, {
      algorithm: 'bcrypt',
      cost: 10,
    });

    const id = crypto.randomUUID();
    const now = new Date();

    await db.insert(schema.users).values({
      id,
      username,
      passwordHash,
      createdAt: now,
    });

    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, id),
    });

    if (!user) {
      throw new Error('Failed to create user');
    }

    return user;
  }

  /**
   * Authenticate user and create session
   */
  async login(username: string, password: string): Promise<{ user: User; session: AuthSession }> {
    const user = await db.query.users.findFirst({
      where: eq(schema.users.username, username),
    });

    if (!user) {
      throw new Error('Invalid username or password');
    }

    const valid = await Bun.password.verify(password, user.passwordHash);
    if (!valid) {
      throw new Error('Invalid username or password');
    }

    // Update last login time
    await db
      .update(schema.users)
      .set({ lastLoginAt: new Date() })
      .where(eq(schema.users.id, user.id));

    // Create session
    const session = await this.createSession(user.id);

    return { user, session };
  }

  /**
   * Create a new auth session for a user
   */
  async createSession(userId: string): Promise<AuthSession> {
    const id = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + AuthService.SESSION_DURATION_MS);

    await db.insert(schema.authSessions).values({
      id,
      userId,
      createdAt: now,
      expiresAt,
    });

    const session = await db.query.authSessions.findFirst({
      where: eq(schema.authSessions.id, id),
    });

    if (!session) {
      throw new Error('Failed to create session');
    }

    return session;
  }

  /**
   * Validate a session token and return the session with user
   */
  async validateSession(token: string): Promise<{ session: AuthSession; user: User } | null> {
    if (!token) return null;

    const session = await db.query.authSessions.findFirst({
      where: and(
        eq(schema.authSessions.id, token),
        gt(schema.authSessions.expiresAt, new Date())
      ),
    });

    if (!session) return null;

    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, session.userId),
    });

    if (!user) return null;

    return { session, user };
  }

  /**
   * Logout - delete the session
   */
  async logout(token: string): Promise<void> {
    await db.delete(schema.authSessions).where(eq(schema.authSessions.id, token));
  }

  /**
   * Change user's password
   */
  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, userId),
    });

    if (!user) {
      throw new Error('User not found');
    }

    const valid = await Bun.password.verify(oldPassword, user.passwordHash);
    if (!valid) {
      throw new Error('Current password is incorrect');
    }

    if (newPassword.length < 6) {
      throw new Error('New password must be at least 6 characters');
    }

    const passwordHash = await Bun.password.hash(newPassword, {
      algorithm: 'bcrypt',
      cost: 10,
    });

    await db
      .update(schema.users)
      .set({ passwordHash })
      .where(eq(schema.users.id, userId));

    // Invalidate all sessions except current
    await db.delete(schema.authSessions).where(eq(schema.authSessions.userId, userId));
  }

  /**
   * Get user by ID (without password hash)
   */
  async getUserById(id: string): Promise<Omit<User, 'passwordHash'> | null> {
    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, id),
    });

    if (!user) return null;

    const { passwordHash: _, ...safeUser } = user;
    return safeUser;
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<void> {
    await db
      .delete(schema.authSessions)
      .where(lt(schema.authSessions.expiresAt, new Date()));
  }
}

// Export singleton instance
export const authService = new AuthService();
