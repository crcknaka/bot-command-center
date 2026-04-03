import { Hono } from 'hono';
import { db } from '../db/client.js';
import { settings } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { requireAuth, requireSuperadmin } from '../auth/middleware.js';

const settingsApi = new Hono();
settingsApi.use('*', requireAuth);

// GET /api/settings
settingsApi.get('/', async (c) => {
  const rows = db.select().from(settings).all();

  // Mask sensitive values
  const result: Record<string, string> = {};
  for (const row of rows) {
    if (row.key.includes('key') || row.key.includes('token') || row.key.includes('secret')) {
      result[row.key] = row.value ? '••••' + row.value.slice(-4) : '';
    } else {
      result[row.key] = row.value;
    }
  }

  return c.json(result);
});

// PUT /api/settings — bulk update (superadmin only)
settingsApi.put('/', requireSuperadmin, async (c) => {
  const body = await c.req.json<Record<string, string>>();

  for (const [key, value] of Object.entries(body)) {
    const existing = db.select().from(settings).where(eq(settings.key, key)).limit(1).get();
    if (existing) {
      db.update(settings).set({ value, updatedAt: new Date().toISOString() }).where(eq(settings.key, key)).run();
    } else {
      db.insert(settings).values({ key, value }).run();
    }
  }

  return c.json({ ok: true });
});

export { settingsApi };
