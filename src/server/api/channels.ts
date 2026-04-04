import { Hono } from 'hono';
import { db } from '../db/client.js';
import { channels, bots, tasks, sources } from '../db/schema.js';
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
  const { chatId, threadId, threadTitle } = await c.req.json<{ chatId: string; threadId?: number; threadTitle?: string }>();

  const botRecord = db.select().from(bots).where(eq(bots.id, botId)).limit(1).get();
  if (!botRecord) return c.json({ error: 'Bot not found' }, 404);

  let resolvedChatId = chatId;
  let title = chatId;
  let type: 'channel' | 'group' | 'supergroup' = 'channel';
  let isLinked = false;

  try {
    const tempBot = new Bot(botRecord.token);
    const chat = await tempBot.api.getChat(chatId);
    // Always use canonical numeric ID to prevent duplicates
    resolvedChatId = String(chat.id);
    title = ('title' in chat ? chat.title : chat.first_name) ?? chatId;
    if (chat.type === 'channel' || chat.type === 'group' || chat.type === 'supergroup') {
      type = chat.type;
    }
    isLinked = true;
  } catch {
    // Bot may not have access yet — keep user-provided chatId
  }

  // Check for duplicates (same chatId or @username + threadId in this bot)
  const botChannels = db.select().from(channels).where(eq(channels.botId, botId)).all();
  const existing = botChannels.find(ch =>
    (ch.chatId === resolvedChatId || ch.chatId === chatId) &&
    (ch.threadId ?? null) === (threadId ?? null)
  );
  if (existing) {
    return c.json({ error: `Этот ${threadId ? 'топик' : 'канал'} уже добавлен.` }, 409);
  }

  const created = db.insert(channels).values({
    botId,
    chatId: resolvedChatId,
    title,
    type,
    isTest: false,
    threadId: threadId ?? null,
    threadTitle: threadTitle ?? null,
    isLinked,
  }).returning().get();

  return c.json(created, 201);
});

// PATCH /api/channels/:id
channelsApi.patch('/channels/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json<{ chatId?: string; title?: string; threadId?: number | null; threadTitle?: string | null }>();

  // If chatId changed, try to resolve new channel info
  if (body.chatId) {
    const channel = db.select().from(channels).where(eq(channels.id, id)).limit(1).get();
    if (channel) {
      const botRecord = db.select().from(bots).where(eq(bots.id, channel.botId)).limit(1).get();
      if (botRecord) {
        try {
          const tempBot = new Bot(botRecord.token);
          const chat = await tempBot.api.getChat(body.chatId);
          body.title = ('title' in chat ? chat.title : chat.first_name) ?? body.chatId;
          if (chat.type === 'channel' || chat.type === 'group' || chat.type === 'supergroup') {
            (body as any).type = chat.type;
          }
          (body as any).isLinked = true;
        } catch {
          (body as any).isLinked = false;
        }
      }
    }
  }

  const updated = db.update(channels).set(body as any).where(eq(channels.id, id)).returning().get();
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

    const canonicalChatId = String(chat.id);
    db.update(channels).set({ isLinked: true, title, chatId: canonicalChatId }).where(eq(channels.id, id)).run();

    return c.json({ ok: true, isLinked: true, title, chatId: canonicalChatId });
  } catch (err) {
    db.update(channels).set({ isLinked: false }).where(eq(channels.id, id)).run();
    return c.json({ ok: false, isLinked: false, error: (err as Error).message });
  }
});

// POST /api/channels/:id/duplicate — duplicate channel config to a new chatId
channelsApi.post('/channels/:id/duplicate', async (c) => {
  const id = Number(c.req.param('id'));
  const { chatId, threadId } = await c.req.json<{ chatId: string; threadId?: number }>();

  const original = db.select().from(channels).where(eq(channels.id, id)).limit(1).get();
  if (!original) return c.json({ error: 'Канал не найден' }, 404);

  const botRecord = db.select().from(bots).where(eq(bots.id, original.botId)).limit(1).get();
  if (!botRecord) return c.json({ error: 'Бот не найден' }, 404);

  // Resolve new channel info from Telegram
  let resolvedChatId = chatId;
  let title = chatId;
  let type: 'channel' | 'group' | 'supergroup' = original.type as any;
  let isLinked = false;

  try {
    const tempBot = new Bot(botRecord.token);
    const chat = await tempBot.api.getChat(chatId);
    resolvedChatId = String(chat.id);
    title = ('title' in chat ? chat.title : chat.first_name) ?? chatId;
    if (chat.type === 'channel' || chat.type === 'group' || chat.type === 'supergroup') {
      type = chat.type;
    }
    isLinked = true;
  } catch {
    // Bot may not have access yet
  }

  // Create new channel
  const newChannel = db.insert(channels).values({
    botId: original.botId,
    chatId: resolvedChatId,
    title,
    type,
    isTest: false,
    threadId: threadId ?? null,
    isLinked,
  }).returning().get();

  // Duplicate all tasks
  const originalTasks = db.select().from(tasks).where(eq(tasks.channelId, original.id)).all();

  for (const task of originalTasks) {
    const newTask = db.insert(tasks).values({
      channelId: newChannel.id,
      name: task.name,
      type: task.type as any,
      config: task.config,
      enabled: task.enabled,
      schedule: task.schedule,
    }).returning().get();

    // Duplicate sources for this task
    const taskSources = db.select().from(sources).where(eq(sources.taskId, task.id)).all();
    for (const src of taskSources) {
      db.insert(sources).values({
        taskId: newTask.id,
        type: src.type as any,
        url: src.url,
        name: src.name,
        enabled: src.enabled,
        fetchIntervalMinutes: src.fetchIntervalMinutes,
      }).run();
    }
  }

  return c.json(newChannel, 201);
});

export { channelsApi };
