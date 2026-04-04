import { Hono } from 'hono';
import { db } from '../db/client.js';
import { activityLog, users, bots } from '../db/schema.js';
import { desc, eq, like, gte, and, or, SQL } from 'drizzle-orm';
import { requireAuth, requireSuperadmin } from '../auth/middleware.js';

const activityApi = new Hono();
activityApi.use('*', requireAuth);
activityApi.use('*', requireSuperadmin);

// GET /api/activity
activityApi.get('/', async (c) => {
  const limit = Number(c.req.query('limit') || '50');
  const type = c.req.query('type');   // auth, bot, post, mod
  const period = c.req.query('period'); // today, week, month

  const conditions: SQL[] = [];

  // Filter by action type prefix
  if (type === 'auth') {
    conditions.push(or(like(activityLog.action, 'user.login%'), like(activityLog.action, 'user.registered%'))!);
  } else if (type === 'bot') {
    conditions.push(like(activityLog.action, 'bot.%'));
  } else if (type === 'post') {
    conditions.push(like(activityLog.action, 'post.%'));
  } else if (type === 'mod') {
    conditions.push(like(activityLog.action, 'mod.%'));
  }

  // Filter by period
  if (period === 'today') {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    conditions.push(gte(activityLog.createdAt, start.toISOString()));
  } else if (period === 'week') {
    const start = new Date(); start.setDate(start.getDate() - 7);
    conditions.push(gte(activityLog.createdAt, start.toISOString()));
  } else if (period === 'month') {
    const start = new Date(); start.setDate(start.getDate() - 30);
    conditions.push(gte(activityLog.createdAt, start.toISOString()));
  }

  let query = db.select().from(activityLog);
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }
  const rows = (query as any).orderBy(desc(activityLog.createdAt)).limit(limit).all();

  // Enrich with user/bot names
  const enriched = rows.map((row: any) => {
    const user = row.userId ? db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, row.userId)).limit(1).get() : null;
    const bot = row.botId ? db.select({ name: bots.name }).from(bots).where(eq(bots.id, row.botId)).limit(1).get() : null;
    return {
      ...row,
      userName: user?.name ?? null,
      userEmail: user?.email ?? null,
      botName: bot?.name ?? null,
    };
  });

  return c.json(enriched);
});

export { activityApi };
