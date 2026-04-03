import { db } from '../db/client.js';
import { users, sessions } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

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
  if (existing) return;

  console.log('🔑 Creating default superadmin (admin@localhost / admin)');
  console.log('   ⚠️  Change the password after first login!');
  await createUser('admin@localhost', 'Admin', 'admin', 'superadmin');
}
