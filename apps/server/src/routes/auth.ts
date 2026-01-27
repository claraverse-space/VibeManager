import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authService } from '../services/AuthService';
import { getAuth } from '../middleware/auth';

const auth = new Hono();

// Validation schemas
const setupSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(6).max(100),
});

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(6).max(100),
});

// Check if initial setup is required
auth.get('/setup-status', async (c) => {
  try {
    const required = await authService.isSetupRequired();
    return c.json({ success: true, data: { setupRequired: required } });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Initial setup - create first user
auth.post('/setup', zValidator('json', setupSchema), async (c) => {
  try {
    // Check if setup is still needed
    const required = await authService.isSetupRequired();
    if (!required) {
      return c.json({ success: false, error: 'Setup already completed' }, 400);
    }

    const { username, password } = c.req.valid('json');
    const user = await authService.createUser(username, password);

    // Auto-login after setup
    const { session } = await authService.login(username, password);

    // Set cookie for browser
    c.header(
      'Set-Cookie',
      `vibemanager_session=${session.id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${7 * 24 * 60 * 60}`
    );

    return c.json({
      success: true,
      data: {
        user: { id: user.id, username: user.username },
        token: session.id,
      },
    });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 400);
  }
});

// Login
auth.post('/login', zValidator('json', loginSchema), async (c) => {
  try {
    const { username, password } = c.req.valid('json');
    const { user, session } = await authService.login(username, password);

    // Set cookie for browser
    c.header(
      'Set-Cookie',
      `vibemanager_session=${session.id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${7 * 24 * 60 * 60}`
    );

    return c.json({
      success: true,
      data: {
        user: { id: user.id, username: user.username },
        token: session.id,
      },
    });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 401);
  }
});

// Logout
auth.post('/logout', async (c) => {
  try {
    const authCtx = getAuth(c);
    if (authCtx) {
      await authService.logout(authCtx.sessionId);
    }

    // Clear cookie
    c.header('Set-Cookie', 'vibemanager_session=; Path=/; HttpOnly; Max-Age=0');

    return c.json({ success: true });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Get current user
auth.get('/me', async (c) => {
  try {
    const authCtx = getAuth(c);
    if (!authCtx) {
      return c.json({ success: false, error: 'Not authenticated' }, 401);
    }

    const user = await authService.getUserById(authCtx.userId);
    if (!user) {
      return c.json({ success: false, error: 'User not found' }, 404);
    }

    return c.json({
      success: true,
      data: { id: user.id, username: user.username },
    });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Change password
auth.post('/change-password', zValidator('json', changePasswordSchema), async (c) => {
  try {
    const authCtx = getAuth(c);
    if (!authCtx) {
      return c.json({ success: false, error: 'Not authenticated' }, 401);
    }

    const { oldPassword, newPassword } = c.req.valid('json');
    await authService.changePassword(authCtx.userId, oldPassword, newPassword);

    // Clear cookie to force re-login
    c.header('Set-Cookie', 'vibemanager_session=; Path=/; HttpOnly; Max-Age=0');

    return c.json({ success: true, message: 'Password changed. Please login again.' });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 400);
  }
});

export default auth;
