import { Hono } from 'hono';
import { db } from '../db/client.js';
import { activityLog, users, bots } from '../db/schema.js';
import { desc, eq } from 'drizzle-orm';
import { requireAuth, requireSuperadmin } from '../auth/middleware.js';

const activityApi = new Hono();
activityApi.use('*', requireAuth);
activityApi.use('*', requireSuperadmin);

// GET /api/activity
activityApi.get('/', async (c) => {
  const limit = Number(c.req.query('limit') || '50');
  const rows = db.select().from(activityLog).orderBy(desc(activityLog.createdAt)).limit(limit).all();

  // Enrich with user/bot names
  const enriched = rows.map((row) => {
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
