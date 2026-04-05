import { Hono } from 'hono';
import { db } from '../db/client.js';
import { bots, channels, posts, activityLog, messageStats, settings } from '../db/schema.js';
import { eq, count, and, gte, sql, inArray } from 'drizzle-orm';
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
  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - 6);
  const weekStartStr = weekStart.toISOString();

  // Single query: load all posts from last 7 days
  const allPosts = db.select().from(posts)
    .where(gte(posts.createdAt, weekStartStr))
    .all();

  const days: { date: string; published: number; failed: number; drafts: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const dayStart = d.toISOString();
    const nextDay = new Date(d);
    nextDay.setDate(nextDay.getDate() + 1);
    const dayEnd = nextDay.toISOString();

    const dayPosts = allPosts.filter((p) => {
      const t = p.publishedAt ?? p.createdAt;
      return t >= dayStart && t < dayEnd;
    });

    days.push({
      date: dayStart.slice(0, 10),
      published: dayPosts.filter((p) => p.status === 'published').length,
      failed: dayPosts.filter((p) => p.status === 'failed').length,
      drafts: dayPosts.filter((p) => p.status === 'draft').length,
    });
  }

  return c.json(days);
});

// GET /api/stats/top-channels — most active channels
statsApi.get('/top-channels', async (c) => {
  const allChannels = db.select().from(channels).all();
  if (allChannels.length === 0) return c.json([]);

  // Single query: load all posts for these channels
  const channelIds = allChannels.map(ch => ch.id);
  const allPosts = db.select().from(posts).where(inArray(posts.channelId, channelIds)).all();

  // Group posts by channel in memory
  const postsByChannel: Record<number, typeof allPosts> = {};
  for (const p of allPosts) {
    (postsByChannel[p.channelId] ??= []).push(p);
  }

  const result = allChannels.map((ch) => {
    const chPosts = postsByChannel[ch.id] ?? [];
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

/** Helper: get filtered messages for a chat with thread filtering */
function filterByThread<T extends { threadId: number | null }>(msgs: T[], threadId?: string): T[] {
  if (!threadId || threadId === 'all') return msgs;
  if (threadId === 'general') return msgs.filter(m => m.threadId === null || m.threadId === undefined);
  return msgs.filter(m => String(m.threadId) === threadId);
}

/** Helper: get filtered messages for a chat (excludes reactions — they're not messages) */
function getChatMessages(chatId: string, period: string, threadId?: string) {
  const periodDays: Record<string, number> = { week: 7, '2weeks': 14, month: 30, '3months': 90 };
  const days = periodDays[period];

  let since = '';
  if (days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    since = d.toISOString();
  }

  const msgs = db.select().from(messageStats)
    .where(since
      ? and(eq(messageStats.chatId, chatId), gte(messageStats.createdAt, since))
      : eq(messageStats.chatId, chatId)
    ).all()
    .filter(m => m.messageType !== 'reaction'); // reactions tracked separately

  return filterByThread(msgs, threadId);
}

// GET /api/stats/chat/:chatId/top-users — top users by message count
statsApi.get('/chat/:chatId/top-users', async (c) => {
  const chatId = c.req.param('chatId');
  const period = c.req.query('period') ?? 'week';
  const threadId = c.req.query('threadId');

  const allMsgs = getChatMessages(chatId, period, threadId);

  // Group by user
  const users: Record<number, { userId: number; userName: string; username: string | null; count: number; types: Record<string, number>; textLength: number; lastMessage: string | null; lastMessageAt: string | null }> = {};
  for (const m of allMsgs) {
    if (!users[m.userId]) users[m.userId] = { userId: m.userId, userName: m.userName ?? 'Unknown', username: m.username, count: 0, types: {}, textLength: 0, lastMessage: null, lastMessageAt: null };
    users[m.userId].count++;
    users[m.userId].types[m.messageType] = (users[m.userId].types[m.messageType] ?? 0) + 1;
    users[m.userId].textLength += m.textLength ?? 0;
    if (m.userName) users[m.userId].userName = m.userName;
    if (m.username) users[m.userId].username = m.username;
    // Track last message
    if (!users[m.userId].lastMessageAt || m.createdAt > users[m.userId].lastMessageAt!) {
      users[m.userId].lastMessageAt = m.createdAt;
      users[m.userId].lastMessage = m.textPreview ?? `[${m.messageType}]`;
    }
  }

  const sorted = Object.values(users).sort((a, b) => b.count - a.count).slice(0, 20)
    .map(u => ({ ...u, avgLength: u.count > 0 ? Math.round(u.textLength / u.count) : 0 }));
  return c.json({ total: allMsgs.length, users: sorted });
});

// GET /api/stats/chat/:chatId/activity — messages per day
statsApi.get('/chat/:chatId/activity', async (c) => {
  const chatId = c.req.param('chatId');
  const period = c.req.query('period') ?? 'week';
  const threadId = c.req.query('threadId');
  const periodDays: Record<string, number> = { week: 7, '2weeks': 14, month: 30, '3months': 90 };
  const days = periodDays[period] ?? 7;

  const allMsgs = getChatMessages(chatId, period, threadId);

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

  // Single query: load all messages for this chat (excluding reactions), then filter by period in memory
  const allMsgs = filterByThread(
    db.select().from(messageStats).where(eq(messageStats.chatId, chatId)).all()
      .filter(m => m.messageType !== 'reaction'),
    threadId
  );

  const now = new Date();
  const periods: Record<string, number> = { week: 7, '2weeks': 14, month: 30, '3months': 90 };
  const data: Record<string, any> = {};

  for (const [key, days] of Object.entries(periods)) {
    const since = new Date(now);
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString();
    const msgs = allMsgs.filter(m => m.createdAt >= sinceStr);
    data[key] = { messages: msgs.length, users: new Set(msgs.map(m => m.userId)).size, avgPerDay: Math.round(msgs.length / days) };
  }

  // All time
  const firstMsg = allMsgs.length > 0 ? allMsgs.reduce((a, b) => a.createdAt < b.createdAt ? a : b) : null;
  const totalDays = firstMsg ? Math.max(1, Math.round((Date.now() - new Date(firstMsg.createdAt + 'Z').getTime()) / 86400000)) : 1;
  data['all'] = { messages: allMsgs.length, users: new Set(allMsgs.map(m => m.userId)).size, avgPerDay: Math.round(allMsgs.length / totalDays) };

  // Peak hour from all messages (adjusted to client timezone)
  const tzOffset = Number(c.req.query('tz') ?? 0);
  const hourCounts: Record<number, number> = {};
  for (const m of allMsgs) {
    const utcMs = new Date(m.createdAt + 'Z').getTime();
    const h = new Date(utcMs - tzOffset * 60000).getUTCHours();
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

  // Get thread names — filtered queries instead of loading ALL
  const threadIds = Object.keys(threads);
  const settingKeys = threadIds.map(tid => `thread_name:${chatId}:${tid}`);
  const threadSettings = settingKeys.length > 0
    ? db.select().from(settings).where(inArray(settings.key, settingKeys)).all()
    : [];
  const chatChannels = db.select().from(channels).where(eq(channels.chatId, chatId)).all();

  const result = Object.entries(threads).map(([tid, count]) => {
    let title = tid === 'general' ? 'Общий' : `Топик #${tid}`;
    const settingKey = `thread_name:${chatId}:${tid}`;
    const setting = threadSettings.find(s => s.key === settingKey);
    if (setting) title = setting.value;
    if (title.startsWith('Топик #')) {
      const ch = chatChannels.find(c => String(c.threadId) === tid);
      if (ch?.threadTitle) title = ch.threadTitle;
    }
    return { threadId: tid, title, messageCount: count };
  }).sort((a, b) => b.messageCount - a.messageCount);

  return c.json(result);
});

// GET /api/stats/chat/:chatId/hourly — messages by hour of day
statsApi.get('/chat/:chatId/hourly', async (c) => {
  const chatId = c.req.param('chatId');
  const period = c.req.query('period') ?? 'week';
  const threadId = c.req.query('threadId');
  const tzOffset = Number(c.req.query('tz') ?? 0); // minutes offset from UTC

  const msgs = getChatMessages(chatId, period, threadId);
  const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }));
  for (const m of msgs) {
    const utcMs = new Date(m.createdAt + 'Z').getTime();
    const localH = new Date(utcMs - tzOffset * 60000).getUTCHours();
    hours[localH].count++;
  }
  return c.json(hours);
});

// GET /api/stats/chat/:chatId/weekdays — messages by day of week
statsApi.get('/chat/:chatId/weekdays', async (c) => {
  const chatId = c.req.param('chatId');
  const period = c.req.query('period') ?? 'month';
  const threadId = c.req.query('threadId');

  const msgs = getChatMessages(chatId, period, threadId);
  const days = ['Пн', 'В��', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((name, i) => ({ day: i, name, count: 0 }));
  for (const m of msgs) {
    const d = new Date(m.createdAt + 'Z').getDay();
    const idx = d === 0 ? 6 : d - 1; // Mon=0, Sun=6
    days[idx].count++;
  }
  return c.json(days);
});

// GET /api/stats/chat/:chatId/engagement — user engagement tiers + trends
statsApi.get('/chat/:chatId/engagement', async (c) => {
  const chatId = c.req.param('chatId');
  const period = c.req.query('period') ?? 'week';
  const threadId = c.req.query('threadId');

  const periodDays: Record<string, number> = { week: 7, '2weeks': 14, month: 30, '3months': 90 };
  const days = periodDays[period] ?? 7;

  // Single query: load messages for 2x period (current + previous), excluding reactions
  const doublePeriodStart = new Date();
  doublePeriodStart.setDate(doublePeriodStart.getDate() - days * 2);
  const allMsgs = filterByThread(
    db.select().from(messageStats)
      .where(and(eq(messageStats.chatId, chatId), gte(messageStats.createdAt, doublePeriodStart.toISOString())))
      .all()
      .filter(m => m.messageType !== 'reaction'),
    threadId
  );

  const periodStart = new Date();
  periodStart.setDate(periodStart.getDate() - days);
  const periodStartStr = periodStart.toISOString();

  const currentMsgs = allMsgs.filter(m => m.createdAt >= periodStartStr);
  const prevMsgs = allMsgs.filter(m => m.createdAt < periodStartStr);

  // Trend: current vs previous period
  const trend = {
    currentMessages: currentMsgs.length,
    prevMessages: prevMsgs.length,
    change: prevMsgs.length > 0 ? Math.round(((currentMsgs.length - prevMsgs.length) / prevMsgs.length) * 100) : (currentMsgs.length > 0 ? 100 : 0),
    currentUsers: new Set(currentMsgs.map(m => m.userId)).size,
    prevUsers: new Set(prevMsgs.map(m => m.userId)).size,
  };

  // Engagement tiers (based on total messages in period, not per-day average)
  // Note: reactions already excluded by getChatMessages/filterByThread above
  const userMsgCount: Record<number, number> = {};
  for (const m of currentMsgs) userMsgCount[m.userId] = (userMsgCount[m.userId] ?? 0) + 1;

  const tiers = {
    power: 0,    // 20+ messages in period
    active: 0,   // 3-19 messages in period
    casual: 0,   // 1-2 messages in period
    total: Object.keys(userMsgCount).length,
  };
  for (const count of Object.values(userMsgCount)) {
    if (count >= 20) tiers.power++;
    else if (count >= 3) tiers.active++;
    else tiers.casual++;
  }

  // New vs returning
  const prevUserIds = new Set(prevMsgs.map(m => m.userId));
  const currentUserIds = new Set(currentMsgs.map(m => m.userId));
  const newUsers = [...currentUserIds].filter(id => !prevUserIds.has(id)).length;
  const returning = [...currentUserIds].filter(id => prevUserIds.has(id)).length;

  // Gone users (active in prev, silent in current)
  const goneUserIds = [...prevUserIds].filter(id => !currentUserIds.has(id));
  const goneUsers = goneUserIds.slice(0, 10).map(id => {
    const lastMsg = prevMsgs.filter(m => m.userId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return { userId: id, userName: lastMsg?.userName ?? 'Unknown', username: lastMsg?.username, lastSeen: lastMsg?.createdAt };
  });

  // Average message length
  const textMsgs = currentMsgs.filter(m => m.messageType === 'text' && m.textLength && m.textLength > 0);
  const avgLength = textMsgs.length > 0 ? Math.round(textMsgs.reduce((s, m) => s + (m.textLength ?? 0), 0) / textMsgs.length) : 0;

  return c.json({ trend, tiers, newUsers, returning, goneUsers: goneUsers.length, goneUsersList: goneUsers, avgMessageLength: avgLength });
});

// GET /api/stats/chat/:chatId/user/:userId — user profile with messages
statsApi.get('/chat/:chatId/user/:userId', async (c) => {
  const chatId = c.req.param('chatId');
  const userId = Number(c.req.param('userId'));
  const search = c.req.query('search') ?? '';
  const limit = Number(c.req.query('limit') ?? 50);
  const offset = Number(c.req.query('offset') ?? 0);

  let msgs = db.select().from(messageStats)
    .where(and(eq(messageStats.chatId, chatId), eq(messageStats.userId, userId)))
    .all()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const total = msgs.length;
  const userName = msgs[0]?.userName ?? 'Unknown';
  const username = msgs[0]?.username ?? null;
  const firstSeen = msgs.length > 0 ? msgs[msgs.length - 1].createdAt : null;
  const lastSeen = msgs.length > 0 ? msgs[0].createdAt : null;

  // Types breakdown
  const types: Record<string, number> = {};
  for (const m of msgs) types[m.messageType] = (types[m.messageType] ?? 0) + 1;

  // Activity by day (last 30 days)
  const activity: Record<string, number> = {};
  const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  for (const m of msgs) {
    if (m.createdAt >= thirtyDaysAgo.toISOString()) {
      const day = m.createdAt.slice(0, 10);
      activity[day] = (activity[day] ?? 0) + 1;
    }
  }

  // Violations — filtered query instead of loading ALL activityLog
  const violations = db.select().from(activityLog)
    .where(and(
      sql`${activityLog.action} LIKE 'mod.%'`,
      sql`json_extract(${activityLog.details}, '$.userId') = ${userId}`,
      sql`json_extract(${activityLog.details}, '$.chatId') = ${Number(chatId)}`
    ))
    .all()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 20)
    .map(l => ({ action: l.action, reason: (l.details as any)?.reason, messageText: (l.details as any)?.messageText, createdAt: l.createdAt }));

  // Filter by search
  if (search) {
    msgs = msgs.filter(m => m.textPreview?.toLowerCase().includes(search.toLowerCase()));
  }

  // Paginate messages
  const messages = msgs.slice(offset, offset + limit).map(m => ({
    id: m.id,
    type: m.messageType,
    text: m.textPreview,
    threadId: m.threadId,
    createdAt: m.createdAt,
  }));

  return c.json({
    userId, userName, username, total, firstSeen, lastSeen,
    types, activity, violations,
    messages, hasMore: offset + limit < (search ? msgs.length : total),
    searchTotal: search ? msgs.length : undefined,
  });
});

// GET /api/stats/chat/:chatId/search — search messages across all users
statsApi.get('/chat/:chatId/search', async (c) => {
  const chatId = c.req.param('chatId');
  const query = c.req.query('q') ?? '';
  const limit = Number(c.req.query('limit') ?? 50);
  if (!query || query.length < 2) return c.json({ results: [], total: 0 });

  // Use SQL LIKE instead of loading all messages
  const msgs = db.select().from(messageStats)
    .where(and(
      eq(messageStats.chatId, chatId),
      sql`lower(${messageStats.textPreview}) LIKE ${'%' + query.toLowerCase() + '%'}`
    ))
    .all()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);

  return c.json({
    results: msgs.map(m => ({
      userId: m.userId, userName: m.userName, username: m.username,
      text: m.textPreview, type: m.messageType, threadId: m.threadId, createdAt: m.createdAt,
    })),
    total: msgs.length,
  });
});

// PATCH /api/stats/chat/:chatId/threads/:threadId — rename a thread
statsApi.patch('/chat/:chatId/threads/:threadId', async (c) => {
  const chatId = c.req.param('chatId');
  const threadId = c.req.param('threadId');
  const { title } = await c.req.json<{ title: string }>();
  if (!title?.trim()) return c.json({ error: 'Название обязательно' }, 400);

  // Store thread name in settings as key-value
  const key = `thread_name:${chatId}:${threadId}`;
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
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoStr = weekAgo.toISOString();

  // Load only recent messages instead of ALL messageStats
  const recentMsgs = db.select().from(messageStats)
    .where(gte(messageStats.createdAt, weekAgoStr))
    .all();

  // Also get distinct chatIds that have any stats (for chats with no recent activity)
  const allChatIds = db.select({ chatId: messageStats.chatId })
    .from(messageStats)
    .groupBy(messageStats.chatId)
    .all()
    .map(r => r.chatId);

  const allChannels = db.select().from(channels).all();

  // Group recent messages by chatId
  const recentByChat: Record<string, typeof recentMsgs> = {};
  for (const m of recentMsgs) {
    (recentByChat[m.chatId] ??= []).push(m);
  }

  const result = allChatIds.map(chatId => {
    const weekMsgs = (recentByChat[chatId] ?? []).filter(m => m.messageType !== 'reaction');
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

// ─── Post Analytics ──────────────────────────────────────────────────────────

// GET /api/stats/posts/top — top posts by reactions
statsApi.get('/posts/top', async (c) => {
  const channelId = c.req.query('channelId');
  const limit = Number(c.req.query('limit') ?? 10);

  const conditions = [eq(posts.status, 'published')];
  if (channelId) conditions.push(eq(posts.channelId, Number(channelId)));

  const topPosts = db.select().from(posts)
    .where(and(...conditions))
    .all()
    .filter(p => (p.reactionCount ?? 0) > 0)
    .sort((a, b) => (b.reactionCount ?? 0) - (a.reactionCount ?? 0))
    .slice(0, limit);

  const allChannels = db.select().from(channels).all();
  const channelMap: Record<number, string> = {};
  for (const ch of allChannels) channelMap[ch.id] = ch.title;

  return c.json(topPosts.map(p => ({
    id: p.id,
    channelId: p.channelId,
    channelTitle: channelMap[p.channelId] ?? '',
    content: p.content.slice(0, 200),
    imageUrl: p.imageUrl,
    reactions: p.reactions,
    reactionCount: p.reactionCount,
    publishedAt: p.publishedAt,
  })));
});

// GET /api/stats/posts/best-time — best publishing time based on reactions
statsApi.get('/posts/best-time', async (c) => {
  const channelId = c.req.query('channelId');
  const tzOffset = Number(c.req.query('tz') ?? 0);

  const conditions = [eq(posts.status, 'published')];
  if (channelId) conditions.push(eq(posts.channelId, Number(channelId)));

  const published = db.select().from(posts).where(and(...conditions)).all().filter(p => p.publishedAt);

  const hourData: Record<number, { posts: number; reactions: number }> = {};
  for (const p of published) {
    const utcMs = new Date(p.publishedAt!).getTime();
    const h = new Date(utcMs - tzOffset * 60000).getUTCHours();
    if (!hourData[h]) hourData[h] = { posts: 0, reactions: 0 };
    hourData[h].posts++;
    hourData[h].reactions += p.reactionCount ?? 0;
  }

  const hours = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    posts: hourData[h]?.posts ?? 0,
    reactions: hourData[h]?.reactions ?? 0,
    avgReactions: hourData[h] ? Math.round((hourData[h].reactions / hourData[h].posts) * 10) / 10 : 0,
  }));

  return c.json(hours);
});

export { statsApi };
