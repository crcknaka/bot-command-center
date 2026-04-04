import { Hono } from 'hono';
import { db } from '../db/client.js';
import { bots, channels, posts, activityLog } from '../db/schema.js';
import { eq, count, and, gte, desc, sql } from 'drizzle-orm';
import { requireAuth } from '../auth/middleware.js';

const statsApi = new Hono();
statsApi.use('*', requireAuth);

// GET /api/stats/overview
statsApi.get('/overview', async (c) => {
  const user = (c as any).get('user');

  const totalBots = user.role === 'superadmin'
    ? db.select({ value: count() }).from(bots).get()!.value
    : db.select({ value: count() }).from(bots).where(eq(bots.ownerId, user.id)).get()!.value;

  const totalChannels = db.select({ value: count() }).from(channels).get()!.value;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString();

  const postsToday = db.select({ value: count() }).from(posts)
    .where(and(eq(posts.status, 'published'), gte(posts.publishedAt, todayStr))).get()!.value;

  const queuedPosts = db.select({ value: count() }).from(posts)
    .where(eq(posts.status, 'queued')).get()!.value;

  const draftPosts = db.select({ value: count() }).from(posts)
    .where(eq(posts.status, 'draft')).get()!.value;

  return c.json({
    totalBots,
    totalChannels,
    postsToday,
    queuedPosts,
    draftPosts,
  });
});

// GET /api/stats/weekly — posts per day for last 7 days
statsApi.get('/weekly', async (c) => {
  const days: { date: string; published: number; failed: number; drafts: number }[] = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const dayStart = d.toISOString();
    const nextDay = new Date(d);
    nextDay.setDate(nextDay.getDate() + 1);
    const dayEnd = nextDay.toISOString();

    const allPosts = db.select().from(posts).all().filter((p) => {
      const t = p.publishedAt ?? p.createdAt;
      return t >= dayStart && t < dayEnd;
    });

    days.push({
      date: dayStart.slice(0, 10),
      published: allPosts.filter((p) => p.status === 'published').length,
      failed: allPosts.filter((p) => p.status === 'failed').length,
      drafts: allPosts.filter((p) => p.status === 'draft').length,
    });
  }

  return c.json(days);
});

// GET /api/stats/top-channels — most active channels
statsApi.get('/top-channels', async (c) => {
  const allChannels = db.select().from(channels).all();
  const result = allChannels.map((ch) => {
    const chPosts = db.select().from(posts).where(eq(posts.channelId, ch.id)).all();
    return {
      id: ch.id,
      title: ch.title,
      chatId: ch.chatId,
      totalPosts: chPosts.length,
      published: chPosts.filter((p) => p.status === 'published').length,
      queued: chPosts.filter((p) => p.status === 'queued').length,
    };
  }).filter((ch) => ch.totalPosts > 0).sort((a, b) => b.published - a.published).slice(0, 5);

  return c.json(result);
});

// GET /api/stats/moderation — moderation action counts
statsApi.get('/moderation', async (c) => {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const since = weekAgo.toISOString();

  const logs = db.select().from(activityLog)
    .where(and(
      gte(activityLog.createdAt, since),
      sql`${activityLog.action} LIKE 'mod.%'`
    )).all();

  const deleted = logs.filter((l) => l.action === 'mod.deleted').length;
  const muted = logs.filter((l) => l.action === 'mod.muted').length;
  const warned = logs.filter((l) => l.action === 'mod.warned').length;

  // Top violators
  const violators: Record<string, { name: string; count: number }> = {};
  logs.forEach((l) => {
    const d = l.details as any;
    if (d?.userName) {
      const key = String(d.userId ?? d.userName);
      if (!violators[key]) violators[key] = { name: d.userName, count: 0 };
      violators[key].count++;
    }
  });
  const topViolators = Object.values(violators).sort((a, b) => b.count - a.count).slice(0, 5);

  return c.json({ deleted, muted, warned, total: logs.length, topViolators });
});

export { statsApi };
