import type { Context, Next } from 'hono';
import { getSession } from './index.js';

type UserRole = 'superadmin' | 'client';

/**
 * Extracts the session token from the Authorization header or cookie.
 */
function extractToken(c: Context): string | null {
  const auth = c.req.header('Authorization');
  if (auth?.startsWith('Bearer ')) {
    return auth.slice(7);
  }
  // Fallback: check cookie
  const cookie = c.req.header('Cookie');
  if (cookie) {
    const match = cookie.match(/session=([^;]+)/);
    if (match) return match[1];
  }
  return null;
}

/**
 * Middleware: require authenticated user. Sets c.set('user', ...) and c.set('session', ...).
 */
export async function requireAuth(c: Context, next: Next) {
  const token = extractToken(c);
  if (!token) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const result = getSession(token);
  if (!result) {
    return c.json({ error: 'Invalid or expired session' }, 401);
  }

  c.set('user', result.user);
  c.set('sessionToken', token);
  await next();
}

/**
 * Middleware: require superadmin role. Must be used after requireAuth.
 */
export async function requireSuperadmin(c: Context, next: Next) {
  const user = c.get('user') as { role: UserRole } | undefined;
  if (!user || user.role !== 'superadmin') {
    return c.json({ error: 'Superadmin access required' }, 403);
  }
  await next();
}
