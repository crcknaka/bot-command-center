import { db } from '../db/client.js';
import { users, sessions } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const MIN_PASSWORD_LENGTH = 8;
// The password older versions created the first admin with
const LEGACY_DEFAULT_PASSWORD = 'admin';

/** Error text for a password that is too weak, or null when it is acceptable */
export function passwordProblem(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return `Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов`;
  }
  if (password === LEGACY_DEFAULT_PASSWORD) return 'Этот пароль использовать нельзя';
  return null;
}

// bcrypt is slow on purpose, so the answer is remembered per user until the password changes
const defaultPasswordCache = new Map<number, boolean>();

/** True while the account still has the well-known default password */
export async function hasDefaultPassword(user: { id: number; passwordHash: string }): Promise<boolean> {
  const cached = defaultPasswordCache.get(user.id);
  if (cached !== undefined) return cached;
  const isDefault = await bcrypt.compare(LEGACY_DEFAULT_PASSWORD, user.passwordHash);
  defaultPasswordCache.set(user.id, isDefault);
  return isDefault;
}

export async function setPassword(userId: number, password: string, keepSessionToken?: string) {
  const passwordHash = await bcrypt.hash(password, 12);
  db.update(users).set({ passwordHash }).where(eq(users.id, userId)).run();
  defaultPasswordCache.delete(userId);
  // Sign out everywhere else: a changed password should end sessions opened with the old one
  for (const s of db.select().from(sessions).where(eq(sessions.userId, userId)).all()) {
    if (s.id !== keepSessionToken) db.delete(sessions).where(eq(sessions.id, s.id)).run();
  }
}

export async function createUser(email: string, name: string, password: string, role: 'superadmin' | 'client' = 'client') {
  const passwordHash = await bcrypt.hash(password, 12);
  const user = db.insert(users).values({ email, name, passwordHash, role }).returning().get();
  return user;
}

export async function login(email: string, password: string) {
  const user = db.select().from(users).where(eq(users.email, email)).limit(1).get();
  if (!user || !user.isActive) return null;

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;

  // Update last login
  db.update(users).set({ lastLoginAt: new Date().toISOString() }).where(eq(users.id, user.id)).run();

  // Create session
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
  db.insert(sessions).values({ id: token, userId: user.id, expiresAt }).run();

  return { user, token };
}

export function getSession(token: string) {
  const session = db.select().from(sessions).where(eq(sessions.id, token)).limit(1).get();
  if (!session) return null;
  if (new Date(session.expiresAt) < new Date()) {
    db.delete(sessions).where(eq(sessions.id, token)).run();
    return null;
  }

  const user = db.select().from(users).where(eq(users.id, session.userId)).limit(1).get();
  if (!user || !user.isActive) return null;

  return { user, session };
}

export function logout(token: string) {
  db.delete(sessions).where(eq(sessions.id, token)).run();
}

export async function ensureSuperadmin() {
  const existing = db.select().from(users).where(eq(users.role, 'superadmin')).limit(1).get();
  if (existing) {
    if (await hasDefaultPassword(existing)) {
      console.warn(`⚠️  ${existing.email} still uses the default password — change it in Settings.`);
    }
    return;
  }

  // First start: no well-known credentials. ADMIN_PASSWORD wins; otherwise a random one, shown once.
  const email = process.env.ADMIN_EMAIL || 'admin@localhost';
  const fromEnv = process.env.ADMIN_PASSWORD;
  if (fromEnv && passwordProblem(fromEnv)) throw new Error(`ADMIN_PASSWORD: ${passwordProblem(fromEnv)}`);
  const password = fromEnv || randomBytes(12).toString('base64url');
  await createUser(email, 'Admin', password, 'superadmin');
  console.log(`🔑 Created superadmin ${email}`);
  if (!fromEnv) console.log(`   One-time password: ${password}  (change it after the first login)`);
}
