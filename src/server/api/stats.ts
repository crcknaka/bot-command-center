import { Hono } from 'hono';
import { db } from '../db/client.js';
import { bots, channels, posts, activityLog, messageStats } from '../db/schema.js';
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

/** Helper: get filtered messages for a chat */
function getChatMessages(chatId: string, period: string, threadId?: string) {
  const periodDays: Record<string, number> = { week: 7, '2weeks': 14, month: 30, '3months': 90 };
  const days = periodDays[period];

  let since = '';
  if (days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    since = d.toISOString();
  }

  let msgs = db.select().from(messageStats)
    .where(since
      ? and(eq(messageStats.chatId, chatId), gte(messageStats.createdAt, since))
      : eq(messageStats.chatId, chatId)
    ).all();

  if (threadId && threadId !== 'all') {
    if (threadId === 'general') {
      msgs = msgs.filter(m => m.threadId === null || m.threadId === undefined);
    } else {
      msgs = msgs.filter(m => String(m.threadId) === threadId);
    }
  }
  return msgs;
}

// GET /api/stats/chat/:chatId/top-users — top users by message count
statsApi.get('/chat/:chatId/top-users', async (c) => {
  const chatId = c.req.param('chatId');
  const period = c.req.query('period') ?? 'week';
  const threadId = c.req.query('threadId');

  const allMsgs = getChatMessages(chatId, period, threadId);

  // Group by user
  const users: Record<number, { userId: number; userName: string; username: string | null; count: number; types: Record<string, number>; textLength: number }> = {};
  for (const m of allMsgs) {
    if (!users[m.userId]) users[m.userId] = { userId: m.userId, userName: m.userName ?? 'Unknown', username: m.username, count: 0, types: {}, textLength: 0 };
    users[m.userId].count++;
    users[m.userId].types[m.messageType] = (users[m.userId].types[m.messageType] ?? 0) + 1;
    users[m.userId].textLength += m.textLength ?? 0;
    // Update name to latest
    if (m.userName) users[m.userId].userName = m.userName;
    if (m.username) users[m.userId].username = m.username;
  }

  const sorted = Object.values(users).sort((a, b) => b.count - a.count).slice(0, 20);
  return c.json({ total: allMsgs.length, users: sorted });
});

// GET /api/stats/chat/:chatId/activity — messages per day
statsApi.get('/chat/:chatId/activity', async (c) => {
  const chatId = c.req.param('chatId');
  const period = c.req.query('period') ?? 'week';
  const threadId = c.req.query('threadId');
  const periodDays: Record<string, number> = { week: 7, '2weeks': 14, month: 30, '3months': 90 };
  const days = periodDays[period] ?? 7;

  const allMsgs = getChatMessages(chatId, 'all', threadId);

  const result: { date: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const dayStart = d.toISOString();
    const nextDay = new Date(d);
    nextDay.setDate(nextDay.getDate() + 1);
    const dayEnd = nextDay.toISOString();

    result.push({ date: dayStart.slice(0, 10), count: allMsgs.filter(m => m.createdAt >= dayStart && m.createdAt < dayEnd).length });
  }

  return c.json(result);
});

// GET /api/stats/chat/:chatId/types — message type distribution
statsApi.get('/chat/:chatId/types', async (c) => {
  const chatId = c.req.param('chatId');
  const period = c.req.query('period') ?? 'week';
  const threadId = c.req.query('threadId');

  const msgs = getChatMessages(chatId, period, threadId);
  const types: Record<string, number> = {};
  for (const m of msgs) types[m.messageType] = (types[m.messageType] ?? 0) + 1;

  return c.json(types);
});

// GET /api/stats/chat/:chatId/summary — overview numbers
statsApi.get('/chat/:chatId/summary', async (c) => {
  const chatId = c.req.param('chatId');
  const threadId = c.req.query('threadId');

  const periods: Record<string, number> = { week: 7, '2weeks': 14, month: 30, '3months': 90 };
  const data: Record<string, any> = {};

  for (const [key, days] of Object.entries(periods)) {
    const msgs = getChatMessages(chatId, key, threadId);
    data[key] = { messages: msgs.length, users: new Set(msgs.map(m => m.userId)).size, avgPerDay: Math.round(msgs.length / days) };
  }

  // All time
  const allMsgs = getChatMessages(chatId, 'all', threadId);
  const firstMsg = allMsgs.length > 0 ? allMsgs.reduce((a, b) => a.createdAt < b.createdAt ? a : b) : null;
  const totalDays = firstMsg ? Math.max(1, Math.round((Date.now() - new Date(firstMsg.createdAt + 'Z').getTime()) / 86400000)) : 1;
  data['all'] = { messages: allMsgs.length, users: new Set(allMsgs.map(m => m.userId)).size, avgPerDay: Math.round(allMsgs.length / totalDays) };

  // Peak hour from all messages
  const hourCounts: Record<number, number> = {};
  for (const m of allMsgs) {
    const h = new Date(m.createdAt + 'Z').getHours();
    hourCounts[h] = (hourCounts[h] ?? 0) + 1;
  }
  const peakHour = Object.entries(hourCounts).sort((a, b) => Number(b[1]) - Number(a[1]))[0];

  return c.json({ ...data, peakHour: peakHour ? { hour: Number(peakHour[0]), count: peakHour[1] } : null });
});

// GET /api/stats/chat/:chatId/threads — list known threads/topics
statsApi.get('/chat/:chatId/threads', async (c) => {
  const chatId = c.req.param('chatId');
  const msgs = db.select().from(messageStats).where(eq(messageStats.chatId, chatId)).all();

  const threads: Record<string, number> = {};
  for (const m of msgs) {
    const key = String(m.threadId ?? 'general');
    threads[key] = (threads[key] ?? 0) + 1;
  }

  // Get thread names from settings
  const { settings } = await import('../db/schema.js');
  const allSettings = db.select().from(settings).all();

  const result = Object.entries(threads).map(([tid, count]) => {
    let title = tid === 'general' ? 'Общий' : `Топик #${tid}`;
    // Check settings for custom name
    const settingKey = `thread_name:${chatId}:${tid}`;
    const setting = allSettings.find(s => s.key === settingKey);
    if (setting) title = setting.value;
    // Also check channels table
    if (title.startsWith('Топик #')) {
      const allChannels = db.select().from(channels).all();
      const ch = allChannels.find(c => c.chatId === chatId && String(c.threadId) === tid);
      if (ch?.threadTitle) title = ch.threadTitle;
    }
    return { threadId: tid, title, messageCount: count };
  }).sort((a, b) => b.messageCount - a.messageCount);

  return c.json(result);
});

// PATCH /api/stats/chat/:chatId/threads/:threadId — rename a thread
statsApi.patch('/chat/:chatId/threads/:threadId', async (c) => {
  const chatId = c.req.param('chatId');
  const threadId = c.req.param('threadId');
  const { title } = await c.req.json<{ title: string }>();

  // Store thread name in settings as key-value
  const key = `thread_name:${chatId}:${threadId}`;
  const { settings } = await import('../db/schema.js');
  const existing = db.select().from(settings).where(eq(settings.key, key)).limit(1).get();
  if (existing) {
    db.update(settings).set({ value: title }).where(eq(settings.key, key)).run();
  } else {
    db.insert(settings).values({ key, value: title }).run();
  }

  return c.json({ ok: true });
});

// GET /api/stats/chats — list chats with stats
statsApi.get('/chats', async (c) => {
  const allMsgs = db.select().from(messageStats).all();
  const chatIds = [...new Set(allMsgs.map(m => m.chatId))];
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  const allChannels = db.select().from(channels).all();

  const result = chatIds.map(chatId => {
    const weekMsgs = allMsgs.filter(m => m.chatId === chatId && m.createdAt >= weekAgo.toISOString());
    const ch = allChannels.find(c => c.chatId === chatId);
    return {
      chatId,
      title: ch?.title ?? chatId,
      type: ch?.type ?? 'group',
      weekMessages: weekMsgs.length,
      weekUsers: new Set(weekMsgs.map(m => m.userId)).size,
    };
  }).sort((a, b) => b.weekMessages - a.weekMessages);

  return c.json(result);
});

export { statsApi };
