import { Hono } from 'hono';
import { login, logout, createUser } from '../auth/index.js';
import { requireAuth, requireSuperadmin } from '../auth/middleware.js';
import { db } from '../db/client.js';
import { invites, users } from '../db/schema.js';
import { logActivity } from '../services/activity.js';
import { eq } from 'drizzle-orm';
import { randomBytes } from 'crypto';

const auth = new Hono();

// POST /api/auth/login
auth.post('/login', async (c) => {
  const { email, password } = await c.req.json<{ email: string; password: string }>();

  const result = await login(email, password);
  if (!result) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }

  logActivity({ userId: result.user.id, action: 'user.login', details: { email } });

  return c.json({
    user: { id: result.user.id, email: result.user.email, name: result.user.name, role: result.user.role },
    token: result.token,
  });
});

// POST /api/auth/logout
auth.post('/logout', requireAuth, async (c) => {
  const token = (c as any).get('sessionToken') as string;
  logout(token);
  return c.json({ ok: true });
});

// GET /api/auth/me
auth.get('/me', requireAuth, async (c) => {
  const user = (c as any).get('user');
  return c.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    avatarUrl: user.avatarUrl,
  });
});

// POST /api/auth/change-password
auth.post('/change-password', requireAuth, async (c) => {
  const user = (c as any).get('user');
  const { currentPassword, newPassword } = await c.req.json<{ currentPassword: string; newPassword: string }>();

  const bcrypt = await import('bcryptjs');
  const fullUser = db.select().from(users).where(eq(users.id, user.id)).limit(1).get();
  if (!fullUser) return c.json({ error: 'Пользователь не найден' }, 404);

  const valid = await bcrypt.default.compare(currentPassword, fullUser.passwordHash);
  if (!valid) return c.json({ error: 'Неверный текущий пароль' }, 400);

  const newHash = await bcrypt.default.hash(newPassword, 12);
  db.update(users).set({ passwordHash: newHash }).where(eq(users.id, user.id)).run();
  logActivity({ userId: user.id, action: 'user.password_changed' });

  return c.json({ ok: true });
});

// POST /api/auth/invite (superadmin only) — create invite link for a client
auth.post('/invite', requireAuth, requireSuperadmin, async (c) => {
  const { email } = await c.req.json<{ email: string }>();
  const user = (c as any).get('user');

  const id = randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

  db.insert(invites).values({ id, email, createdBy: user.id, expiresAt }).run();

  return c.json({ inviteId: id, email, expiresAt });
});

// POST /api/auth/register — register via invite
auth.post('/register', async (c) => {
  const { inviteId, name, password } = await c.req.json<{ inviteId: string; name: string; password: string }>();

  const invite = db.select().from(invites).where(eq(invites.id, inviteId)).limit(1).get();
  if (!invite) return c.json({ error: 'Invalid invite' }, 400);
  if (invite.usedAt) return c.json({ error: 'Invite already used' }, 400);
  if (new Date(invite.expiresAt) < new Date()) return c.json({ error: 'Invite expired' }, 400);

  const user = await createUser(invite.email, name, password, 'client');

  // Mark invite as used
  db.update(invites).set({ usedAt: new Date().toISOString() }).where(eq(invites.id, inviteId)).run();

  // Auto-login
  const result = await login(invite.email, password);

  return c.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    token: result!.token,
  });
});

export { auth };
