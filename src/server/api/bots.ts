import { Hono } from 'hono';
import { db } from '../db/client.js';
import { bots, channels } from '../db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import { requireAuth } from '../auth/middleware.js';
import { botManager } from '../bot/manager.js';
import { Bot } from 'grammy';
import { logActivity } from '../services/activity.js';

const botsApi = new Hono();

botsApi.use('*', requireAuth);

// GET /api/bots
botsApi.get('/', async (c) => {
  const user = (c as any).get('user');

  const rows = user.role === 'superadmin'
    ? db.select().from(bots).all()
    : db.select().from(bots).where(eq(bots.ownerId, user.id)).all();

  // Load all channels in one query to avoid N+1
  const botIds = rows.map((b) => b.id);
  const allChannels = botIds.length > 0
    ? db.select().from(channels).where(inArray(channels.botId, botIds)).all()
    : [];

  const result = rows.map((bot) => ({
    ...bot,
    token: undefined,
    isRunning: botManager.isRunning(bot.id),
    channels: allChannels.filter((ch) => ch.botId === bot.id),
  }));

  return c.json(result);
});

// POST /api/bots — add a new bot
botsApi.post('/', async (c) => {
  const user = (c as any).get('user');
  const { token } = await c.req.json<{ token: string }>();

  try {
    const tempBot = new Bot(token);
    const me = await tempBot.api.getMe();

    const created = db.insert(bots).values({
      ownerId: user.id,
      token,
      name: me.first_name,
      username: me.username,
    }).returning().get();

    logActivity({ userId: user.id, botId: created.id, action: 'bot.created', details: { name: created.name, username: created.username } });
    return c.json({ ...created, token: undefined }, 201);
  } catch {
    return c.json({ error: 'Invalid bot token' }, 400);
  }
});

// GET /api/bots/:id
botsApi.get('/:id', async (c) => {
  const user = (c as any).get('user');
  const id = Number(c.req.param('id'));

  const conditions = user.role === 'superadmin'
    ? eq(bots.id, id)
    : and(eq(bots.id, id), eq(bots.ownerId, user.id));

  const bot = db.select().from(bots).where(conditions).limit(1).get();
  if (!bot) return c.json({ error: 'Not found' }, 404);

  const botChannels = db.select().from(channels).where(eq(channels.botId, id)).all();

  return c.json({
    ...bot,
    token: undefined,
    isRunning: botManager.isRunning(bot.id),
    channels: botChannels,
  });
});

// PATCH /api/bots/:id
botsApi.patch('/:id', async (c) => {
  const user = (c as any).get('user');
  const id = Number(c.req.param('id'));
  const body = await c.req.json<{ name?: string; aiProviderId?: number | null; searchProviderId?: number | null; systemPrompt?: string | null; postLanguage?: string; maxPostsPerDay?: number; minPostIntervalMinutes?: number; maxPostLength?: number }>();

  const conditions = user.role === 'superadmin'
    ? eq(bots.id, id)
    : and(eq(bots.id, id), eq(bots.ownerId, user.id));

  const existing = db.select().from(bots).where(conditions).limit(1).get();
  if (!existing) return c.json({ error: 'Not found' }, 404);

  const updated = db.update(bots)
    .set({ ...body, updatedAt: new Date().toISOString() })
    .where(eq(bots.id, id))
    .returning().get();

  return c.json({ ...updated, token: undefined });
});

// DELETE /api/bots/:id
botsApi.delete('/:id', async (c) => {
  const user = (c as any).get('user');
  const id = Number(c.req.param('id'));

  const conditions = user.role === 'superadmin'
    ? eq(bots.id, id)
    : and(eq(bots.id, id), eq(bots.ownerId, user.id));

  const existing = db.select().from(bots).where(conditions).limit(1).get();
  if (!existing) return c.json({ error: 'Not found' }, 404);

  if (botManager.isRunning(id)) {
    await botManager.stopBot(id);
  }

  db.delete(bots).where(eq(bots.id, id)).run();
  return c.json({ ok: true });
});

// POST /api/bots/:id/start
botsApi.post('/:id/start', async (c) => {
  const id = Number(c.req.param('id'));
  try {
    await botManager.startBot(id);
    logActivity({ userId: (c as any).get('user')?.id, botId: id, action: 'bot.started' });
    return c.json({ ok: true, status: 'active' });
  } catch (err) {
    db.update(bots)
      .set({ status: 'error', errorMessage: (err as Error).message })
      .where(eq(bots.id, id))
      .run();
    return c.json({ error: (err as Error).message }, 500);
  }
});

// POST /api/bots/:id/stop
botsApi.post('/:id/stop', async (c) => {
  const id = Number(c.req.param('id'));
  await botManager.stopBot(id);
  logActivity({ userId: (c as any).get('user')?.id, botId: id, action: 'bot.stopped' });
  return c.json({ ok: true, status: 'stopped' });
});

// POST /api/bots/:id/restart
botsApi.post('/:id/restart', async (c) => {
  const id = Number(c.req.param('id'));
  try {
    await botManager.restartBot(id);
    return c.json({ ok: true, status: 'active' });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

// POST /api/bots/:id/test
botsApi.post('/:id/test', async (c) => {
  const id = Number(c.req.param('id'));
  const botRecord = db.select().from(bots).where(eq(bots.id, id)).limit(1).get();
  if (!botRecord) return c.json({ error: 'Not found' }, 404);

  try {
    const tempBot = new Bot(botRecord.token);
    const me = await tempBot.api.getMe();
    return c.json({ ok: true, username: me.username, firstName: me.first_name });
  } catch (err) {
    return c.json({ ok: false, error: (err as Error).message });
  }
});

export { botsApi };
