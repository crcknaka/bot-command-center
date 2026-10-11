import type { Context, Next } from 'hono';
import { db } from '../db/client.js';
import { bots, channels, tasks, sources } from '../db/schema.js';
import { eq, inArray } from 'drizzle-orm';

type AuthUser = { id: number; role: string };

/**
 * Check that the authenticated user owns a resource (or is superadmin).
 * Returns an error string if access is denied, or null if OK.
 */
export function checkOwnership(
  user: { id: number; role: string },
  resource: { ownerId: number | null } | undefined,
): string | null {
  if (!resource) return 'not_found';
  if (user.role === 'superadmin') return null;
  if (resource.ownerId === null) return null; // global resource accessible to all
  if (resource.ownerId === user.id) return null;
  return 'forbidden';
}

export function canAccessBot(user: AuthUser, botId: number): boolean {
  if (user.role === 'superadmin') return true;
  const bot = db.select({ ownerId: bots.ownerId }).from(bots).where(eq(bots.id, botId)).limit(1).get();
  return bot?.ownerId === user.id;
}

export function canAccessChannel(user: AuthUser, channelId: number): boolean {
  if (user.role === 'superadmin') return true;
  const channel = db.select({ botId: channels.botId }).from(channels).where(eq(channels.id, channelId)).limit(1).get();
  return !!channel && canAccessBot(user, channel.botId);
}

export function canAccessTask(user: AuthUser, taskId: number): boolean {
  if (user.role === 'superadmin') return true;
  const task = db.select({ channelId: tasks.channelId }).from(tasks).where(eq(tasks.id, taskId)).limit(1).get();
  return !!task && canAccessChannel(user, task.channelId);
}

export function canAccessSource(user: AuthUser, sourceId: number): boolean {
  if (user.role === 'superadmin') return true;
  const source = db.select({ taskId: sources.taskId }).from(sources).where(eq(sources.id, sourceId)).limit(1).get();
  return !!source && canAccessTask(user, source.taskId);
}

/** What a non-superadmin may see; null means everything (superadmin) */
export function accessScope(user: AuthUser): { botIds: number[]; channelIds: number[]; chatIds: string[] } | null {
  if (user.role === 'superadmin') return null;
  const botIds = db.select({ id: bots.id }).from(bots).where(eq(bots.ownerId, user.id)).all().map((b) => b.id);
  const own = botIds.length > 0 ? db.select().from(channels).where(inArray(channels.botId, botIds)).all() : [];
  return { botIds, channelIds: own.map((ch) => ch.id), chatIds: [...new Set(own.map((ch) => ch.chatId))] };
}

export function canAccessChat(user: AuthUser, chatId: string): boolean {
  const scope = accessScope(user);
  return !scope || scope.chatIds.includes(chatId);
}

/**
 * Route guard: reads a numeric id from the path and asks `check` whether the user may touch it.
 * Non-numeric values pass through, so literal routes like /tasks/ai-setup keep working.
 */
export function requireAccess(param: string, check: (user: AuthUser, id: number) => boolean) {
  return async (c: Context, next: Next) => {
    const raw = c.req.param(param);
    if (raw !== undefined && /^\d+$/.test(raw)) {
      const user = c.get('user') as AuthUser;
      if (!check(user, Number(raw))) return c.json({ error: 'Нет доступа' }, 403);
    }
    await next();
  };
}
