import { Hono } from 'hono';
import { db } from '../db/client.js';
import { bots, channels, tasks, sources } from '../db/schema.js';
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
  const body = await c.req.json<{ name?: string; aiProviderId?: number | null; searchProviderId?: number | null; systemPrompt?: string | null; postLanguage?: string; maxPostsPerDay?: number; minPostIntervalMinutes?: number; maxPostLength?: number; postSignature?: string | null; autoPin?: boolean; autoDeleteHours?: number | null }>();

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

// GET /api/bots/:id/export — export full bot config as JSON
botsApi.get('/:id/export', async (c) => {
  const user = (c as any).get('user');
  const id = Number(c.req.param('id'));

  const conditions = user.role === 'superadmin' ? eq(bots.id, id) : and(eq(bots.id, id), eq(bots.ownerId, user.id));
  const bot = db.select().from(bots).where(conditions).limit(1).get();
  if (!bot) return c.json({ error: 'Not found' }, 404);

  const botChannels = db.select().from(channels).where(eq(channels.botId, id)).all();

  const exportData = {
    _export: 'bot-command-center',
    _version: 1,
    _exportedAt: new Date().toISOString(),
    bot: {
      token: bot.token,
      name: bot.name,
      systemPrompt: bot.systemPrompt,
      postLanguage: bot.postLanguage,
      maxPostsPerDay: bot.maxPostsPerDay,
      minPostIntervalMinutes: bot.minPostIntervalMinutes,
      maxPostLength: bot.maxPostLength,
      postSignature: bot.postSignature,
      autoPin: bot.autoPin,
      autoDeleteHours: bot.autoDeleteHours,
    },
    channels: botChannels.map((ch) => {
      const chTasks = db.select().from(tasks).where(eq(tasks.channelId, ch.id)).all();
      return {
        chatId: ch.chatId,
        title: ch.title,
        type: ch.type,
        threadId: ch.threadId,
        threadTitle: ch.threadTitle,
        tasks: chTasks.map((t) => {
          const taskSources = db.select().from(sources).where(eq(sources.taskId, t.id)).all();
          return {
            name: t.name,
            type: t.type,
            config: t.config,
            schedule: t.schedule,
            enabled: t.enabled,
            sources: taskSources.map((s) => ({
              type: s.type,
              url: s.url,
              name: s.name,
              enabled: s.enabled,
              fetchIntervalMinutes: s.fetchIntervalMinutes,
            })),
          };
        }),
      };
    }),
  };

  return c.json(exportData);
});

// POST /api/bots/import — import bot from exported JSON
botsApi.post('/import', async (c) => {
  const user = (c as any).get('user');
  const data = await c.req.json<any>();

  if (data._export !== 'bot-command-center') {
    return c.json({ error: 'Неверный формат файла' }, 400);
  }

  // Create bot
  const botData = data.bot;
  if (!botData?.token) return c.json({ error: 'Токен бота обязателен' }, 400);

  let me;
  try {
    const tempBot = new Bot(botData.token);
    me = await tempBot.api.getMe();
  } catch {
    return c.json({ error: 'Невалидный токен бота' }, 400);
  }

  const createdBot = db.insert(bots).values({
    ownerId: user.id,
    token: botData.token,
    name: me.first_name,
    username: me.username,
    systemPrompt: botData.systemPrompt ?? null,
    postLanguage: botData.postLanguage ?? 'Russian',
    maxPostsPerDay: botData.maxPostsPerDay ?? 5,
    minPostIntervalMinutes: botData.minPostIntervalMinutes ?? 60,
    maxPostLength: botData.maxPostLength ?? 2000,
    postSignature: botData.postSignature ?? null,
    autoPin: botData.autoPin ?? false,
    autoDeleteHours: botData.autoDeleteHours ?? null,
  }).returning().get();

  let channelCount = 0;
  let taskCount = 0;

  // Create channels, tasks, sources
  for (const chData of (data.channels ?? [])) {
    const createdChannel = db.insert(channels).values({
      botId: createdBot.id,
      chatId: chData.chatId,
      title: chData.title ?? chData.chatId,
      type: chData.type ?? 'channel',
      threadId: chData.threadId ?? null,
      threadTitle: chData.threadTitle ?? null,
      isLinked: false,
    }).returning().get();
    channelCount++;

    for (const tData of (chData.tasks ?? [])) {
      const createdTask = db.insert(tasks).values({
        channelId: createdChannel.id,
        name: tData.name ?? null,
        type: tData.type as any,
        config: tData.config ?? {},
        schedule: tData.schedule ?? null,
        enabled: tData.enabled ?? false,
      }).returning().get();
      taskCount++;

      for (const sData of (tData.sources ?? [])) {
        db.insert(sources).values({
          taskId: createdTask.id,
          type: sData.type as any,
          url: sData.url,
          name: sData.name,
          enabled: sData.enabled ?? true,
          fetchIntervalMinutes: sData.fetchIntervalMinutes ?? 60,
        }).run();
      }
    }
  }

  logActivity({ userId: user.id, botId: createdBot.id, action: 'bot.imported', details: { channels: channelCount, tasks: taskCount } });
  return c.json({ ok: true, botId: createdBot.id, channels: channelCount, tasks: taskCount }, 201);
});

// POST /api/bots/:id/send — send a message from the bot to a channel
botsApi.post('/:id/send', async (c) => {
  const id = Number(c.req.param('id'));
  const { channelId, text, imageUrl } = await c.req.json<{ channelId: number; text: string; imageUrl?: string }>();

  if (!text?.trim()) return c.json({ error: 'Текст сообщения обязателен' }, 400);

  const botInstance = botManager.getBotInstance(id);
  if (!botInstance) return c.json({ error: 'Бот не запущен' }, 400);

  const channel = db.select().from(channels).where(eq(channels.id, channelId)).limit(1).get();
  if (!channel) return c.json({ error: 'Канал не найден' }, 404);

  try {
    let messageId: number;
    if (imageUrl) {
      const msg = await botInstance.api.sendPhoto(channel.chatId, imageUrl, {
        caption: text,
        parse_mode: 'HTML',
        message_thread_id: channel.threadId ?? undefined,
      });
      messageId = msg.message_id;
    } else {
      const msg = await botInstance.api.sendMessage(channel.chatId, text, {
        parse_mode: 'HTML',
        message_thread_id: channel.threadId ?? undefined,
      });
      messageId = msg.message_id;
    }

    logActivity({ userId: (c as any).get('user')?.id, botId: id, action: 'bot.message_sent', details: { channelId, messageId } });
    return c.json({ ok: true, messageId });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

export { botsApi };
