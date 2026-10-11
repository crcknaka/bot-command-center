import { Hono } from 'hono';
import { login, logout, createUser, hasDefaultPassword, passwordProblem, setPassword } from '../auth/index.js';
import { requireAuth, requireSuperadmin } from '../auth/middleware.js';
import { db } from '../db/client.js';
import { invites, users } from '../db/schema.js';
import { logActivity } from '../services/activity.js';
import { eq } from 'drizzle-orm';
import { randomBytes } from 'crypto';

const auth = new Hono();

// ── Login throttling ─────────────────────────────────────────────────────────
const MAX_FAILED_LOGINS = 5; // per address + account pair
const MAX_FAILED_PER_IP = 30; // per address across all accounts
const LOCKOUT_MS = 15 * 60_000;
const failedLogins = new Map<string, { count: number; first: number }>();

function clientIp(c: any): string {
  return c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
}

/** Minutes left on the lockout for this key, or 0 when attempts are allowed */
function lockedFor(key: string, limit: number): number {
  const entry = failedLogins.get(key);
  if (!entry) return 0;
  const left = entry.first + LOCKOUT_MS - Date.now();
  if (left <= 0) { failedLogins.delete(key); return 0; }
  return entry.count >= limit ? Math.ceil(left / 60_000) : 0;
}

function recordFailedLogin(key: string) {
  const entry = failedLogins.get(key);
  if (entry) entry.count++;
  else failedLogins.set(key, { count: 1, first: Date.now() });
  // Keep the map from growing without bound under a spray of addresses
  if (failedLogins.size > 10_000) {
    for (const [k, v] of failedLogins) if (v.first + LOCKOUT_MS < Date.now()) failedLogins.delete(k);
  }
}

// POST /api/auth/login
auth.post('/login', async (c) => {
  const { email, password } = await c.req.json<{ email: string; password: string }>();
  if (typeof email !== 'string' || typeof password !== 'string') return c.json({ error: 'Invalid email or password' }, 401);

  // The tight limit is per address + account: locking an account for everyone would let
  // a stranger keep its owner out just by typing wrong passwords.
  const ip = clientIp(c);
  const keys = [`pair:${ip}:${email.toLowerCase()}`, `ip:${ip}`];
  const minutes = Math.max(lockedFor(keys[0], MAX_FAILED_LOGINS), lockedFor(keys[1], MAX_FAILED_PER_IP));
  if (minutes > 0) return c.json({ error: `Слишком много попыток входа. Повторите через ${minutes} мин.` }, 429);

  const result = await login(email, password);
  if (!result) {
    keys.forEach(recordFailedLogin);
    return c.json({ error: 'Invalid email or password' }, 401);
  }
  failedLogins.delete(keys[0]);

  logActivity({ userId: result.user.id, action: 'user.login', details: { email } });

  return c.json({
    user: {
      id: result.user.id, email: result.user.email, name: result.user.name, role: result.user.role,
      mustChangePassword: await hasDefaultPassword(result.user),
    },
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
    mustChangePassword: await hasDefaultPassword(user),
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

  const problem = passwordProblem(newPassword);
  if (problem) return c.json({ error: problem }, 400);

  await setPassword(user.id, newPassword, (c as any).get('sessionToken'));
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

// GET /api/auth/invite/:id — check invite validity
auth.get('/invite/:id', async (c) => {
  const id = c.req.param('id');
  const invite = db.select().from(invites).where(eq(invites.id, id)).limit(1).get();
  if (!invite) return c.json({ error: 'Инвайт не найден' }, 404);
  if (invite.usedAt) return c.json({ error: 'Инвайт уже использован' }, 400);
  if (new Date(invite.expiresAt) < new Date()) return c.json({ error: 'Инвайт истёк' }, 400);
  return c.json({ email: invite.email, expiresAt: invite.expiresAt });
});

// POST /api/auth/register — register via invite
auth.post('/register', async (c) => {
  const { inviteId, name, password } = await c.req.json<{ inviteId: string; name: string; password: string }>();

  const invite = db.select().from(invites).where(eq(invites.id, inviteId)).limit(1).get();
  if (!invite) return c.json({ error: 'Invalid invite' }, 400);
  if (invite.usedAt) return c.json({ error: 'Invite already used' }, 400);
  if (new Date(invite.expiresAt) < new Date()) return c.json({ error: 'Invite expired' }, 400);

  const problem = passwordProblem(password);
  if (problem) return c.json({ error: problem }, 400);

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
