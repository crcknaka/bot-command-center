import { Hono } from 'hono';
import { db } from '../db/client.js';
import { channels, bots } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../auth/middleware.js';
import { Bot } from 'grammy';

const channelsApi = new Hono();
channelsApi.use('*', requireAuth);

// GET /api/bots/:botId/channels
channelsApi.get('/bots/:botId/channels', async (c) => {
  const botId = Number(c.req.param('botId'));
  const rows = db.select().from(channels).where(eq(channels.botId, botId)).all();
  return c.json(rows);
});

// POST /api/bots/:botId/channels
channelsApi.post('/bots/:botId/channels', async (c) => {
  const botId = Number(c.req.param('botId'));
  const { chatId, isTest } = await c.req.json<{ chatId: string; isTest?: boolean }>();

  const botRecord = db.select().from(bots).where(eq(bots.id, botId)).limit(1).get();
  if (!botRecord) return c.json({ error: 'Bot not found' }, 404);

  let title = chatId;
  let type: 'channel' | 'group' | 'supergroup' = 'channel';
  let isLinked = false;

  try {
    const tempBot = new Bot(botRecord.token);
    const chat = await tempBot.api.getChat(chatId);
    title = ('title' in chat ? chat.title : chat.first_name) ?? chatId;
    if (chat.type === 'channel' || chat.type === 'group' || chat.type === 'supergroup') {
      type = chat.type;
    }
    isLinked = true;
  } catch {
    // Bot may not have access yet
  }

  const created = db.insert(channels).values({
    botId,
    chatId,
    title,
    type,
    isTest: isTest ?? false,
    isLinked,
  }).returning().get();

  return c.json(created, 201);
});

// PATCH /api/channels/:id
channelsApi.patch('/channels/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json<{ title?: string; isTest?: boolean }>();

  const updated = db.update(channels).set(body).where(eq(channels.id, id)).returning().get();
  if (!updated) return c.json({ error: 'Not found' }, 404);

  return c.json(updated);
});

// DELETE /api/channels/:id
channelsApi.delete('/channels/:id', async (c) => {
  const id = Number(c.req.param('id'));
  db.delete(channels).where(eq(channels.id, id)).run();
  return c.json({ ok: true });
});

// POST /api/channels/:id/verify
channelsApi.post('/channels/:id/verify', async (c) => {
  const id = Number(c.req.param('id'));

  const channel = db.select().from(channels).where(eq(channels.id, id)).limit(1).get();
  if (!channel) return c.json({ error: 'Not found' }, 404);

  const botRecord = db.select().from(bots).where(eq(bots.id, channel.botId)).limit(1).get();
  if (!botRecord) return c.json({ error: 'Bot not found' }, 404);

  try {
    const tempBot = new Bot(botRecord.token);
    const chat = await tempBot.api.getChat(channel.chatId);
    const title = ('title' in chat ? chat.title : chat.first_name) ?? channel.chatId;

    db.update(channels).set({ isLinked: true, title }).where(eq(channels.id, id)).run();

    return c.json({ ok: true, isLinked: true, title });
  } catch (err) {
    db.update(channels).set({ isLinked: false }).where(eq(channels.id, id)).run();
    return c.json({ ok: false, isLinked: false, error: (err as Error).message });
  }
});

export { channelsApi };
