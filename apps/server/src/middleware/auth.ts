import { createMiddleware } from 'hono/factory';
import type { Context, Next } from 'hono';
import { authService } from '../services/AuthService';

// Paths that don't require authentication
const PUBLIC_PATHS = [
  '/api/health',
  '/api/auth/setup-status',
  '/api/auth/setup',
  '/api/auth/login',
];

// Check if path should skip auth
function isPublicPath(path: string): boolean {
  return PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + '/'));
}

// Type for auth context
export interface AuthContext {
  userId: string;
  username: string;
  sessionId: string;
}

/**
 * Auth middleware that validates session tokens
 */
export const authMiddleware = createMiddleware(async (c: Context, next: Next) => {
  const path = c.req.path;

  // Skip auth for public paths
  if (isPublicPath(path)) {
    return next();
  }

  // Get token from Authorization header or cookie
  let token: string | null = null;

  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  }

  // Fallback to cookie
  if (!token) {
    const cookies = c.req.header('Cookie');
    if (cookies) {
      const match = cookies.match(/vibemanager_session=([^;]+)/);
      if (match) {
        token = match[1];
      }
    }
  }

  if (!token) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }

  // Validate session
  const result = await authService.validateSession(token);
  if (!result) {
    return c.json({ success: false, error: 'Invalid or expired session' }, 401);
  }

  // Store auth info in context
  c.set('auth', {
    userId: result.user.id,
    username: result.user.username,
    sessionId: result.session.id,
  } as AuthContext);

  return next();
});

/**
 * Helper to get auth context from request
 */
export function getAuth(c: Context): AuthContext | null {
  return c.get('auth') as AuthContext | null;
}

/**
 * Validate token without middleware (for WebSocket connections)
 */
export async function validateToken(token: string): Promise<AuthContext | null> {
  if (!token) return null;

  const result = await authService.validateSession(token);
  if (!result) return null;

  return {
    userId: result.user.id,
    username: result.user.username,
    sessionId: result.session.id,
  };
}
