import { Hono } from 'hono';
import { db } from '../db/client.js';
import { bots, channels, posts } from '../db/schema.js';
import { eq, count, and, gte } from 'drizzle-orm';
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

export { statsApi };
