import { Hono } from 'hono';
import { db } from '../db/client.js';
import { bots, channels, tasks, sources, messageStats, activityLog } from '../db/schema.js';
import { eq, and, inArray, desc } from 'drizzle-orm';
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

// GET /api/bots/:id/members — list known users from message stats
botsApi.get('/:id/members', async (c) => {
  const id = Number(c.req.param('id'));
  let chatId = c.req.query('chatId');
  if (!chatId) return c.json({ error: 'chatId required' }, 400);

  // If chatId starts with @, resolve numeric ID via bot API
  if (chatId.startsWith('@')) {
    const botInstance = botManager.getBotInstance(id);
    if (botInstance) {
      try {
        const chat = await botInstance.api.getChat(chatId);
        chatId = String(chat.id);
      } catch {}
    }
  }

  const threadId = c.req.query('threadId');

  // Get unique users from message_stats
  let msgs = db.select().from(messageStats).where(eq(messageStats.chatId, chatId)).all();
  if (threadId && threadId !== 'all') {
    msgs = msgs.filter(m => String(m.threadId ?? '') === threadId);
  }
  const usersMap: Record<number, { userId: number; userName: string; username: string | null; messageCount: number; lastSeen: string }> = {};

  for (const m of msgs) {
    if (!usersMap[m.userId]) {
      usersMap[m.userId] = { userId: m.userId, userName: m.userName ?? 'Unknown', username: m.username, messageCount: 0, lastSeen: m.createdAt };
    }
    usersMap[m.userId].messageCount++;
    if (m.createdAt > usersMap[m.userId].lastSeen) usersMap[m.userId].lastSeen = m.createdAt;
    if (m.userName) usersMap[m.userId].userName = m.userName;
    if (m.username) usersMap[m.userId].username = m.username;
  }

  // Check current status via Telegram API
  const botInstance = botManager.getBotInstance(id);
  const users = Object.values(usersMap).sort((a, b) => b.messageCount - a.messageCount);

  // Get status for top users (limit to avoid rate limits)
  for (const user of users.slice(0, 50)) {
    if (botInstance) {
      try {
        const numId = /^-?\d+$/.test(chatId) ? Number(chatId) : chatId;
        const member = await botInstance.api.getChatMember(numId, user.userId);
        (user as any).status = member.status; // 'member', 'restricted', 'kicked', 'administrator', 'creator'
      } catch {
        (user as any).status = 'unknown';
      }
    } else {
      (user as any).status = 'unknown';
    }
  }

  return c.json(users);
});

// POST /api/bots/:id/moderate — ban/mute/unban a user
botsApi.post('/:id/moderate', async (c) => {
  const id = Number(c.req.param('id'));
  const { chatId, userId, action, duration } = await c.req.json<{
    chatId: string;
    userId: number;
    action: 'mute' | 'ban' | 'unban' | 'unmute' | 'restrict_media' | 'restrict_links';
    duration?: number; // minutes (0 = forever)
  }>();

  const botInstance = botManager.getBotInstance(id);
  if (!botInstance) return c.json({ error: 'Бот не запущен' }, 400);

  const user = (c as any).get('user');
  const numChatId = /^-?\d+$/.test(chatId) ? Number(chatId) : chatId;
  const untilDate = duration && duration > 0 ? Math.floor(Date.now() / 1000) + duration * 60 : 0;

  try {
    const muted = { can_send_messages: false, can_send_other_messages: false, can_add_web_page_previews: false, can_send_polls: false } as any;
    const unmuted = { can_send_messages: true, can_send_other_messages: true, can_add_web_page_previews: true, can_send_polls: true, can_send_audios: true, can_send_documents: true, can_send_photos: true, can_send_videos: true, can_send_video_notes: true, can_send_voice_notes: true } as any;
    const noMedia = { can_send_messages: true, can_send_other_messages: false, can_send_photos: false, can_send_videos: false, can_send_audios: false, can_send_documents: false, can_send_voice_notes: false, can_send_video_notes: false } as any;
    const noLinks = { can_send_messages: true, can_send_other_messages: true, can_add_web_page_previews: false } as any;

    switch (action) {
      case 'mute':
        await botInstance.api.restrictChatMember(numChatId, userId, { permissions: muted, until_date: untilDate || undefined, use_independent_chat_permissions: true } as any);
        break;
      case 'unmute': {
        // Get the group's default permissions and apply them to user
        const chatInfo = await botInstance.api.getChat(numChatId) as any;
        const groupPerms = chatInfo.permissions ?? {};
        // Merge: set everything the group allows to true
        const restorePerms = {
          can_send_messages: groupPerms.can_send_messages ?? true,
          can_send_audios: groupPerms.can_send_audios ?? true,
          can_send_documents: groupPerms.can_send_documents ?? true,
          can_send_photos: groupPerms.can_send_photos ?? true,
          can_send_videos: groupPerms.can_send_videos ?? true,
          can_send_video_notes: groupPerms.can_send_video_notes ?? true,
          can_send_voice_notes: groupPerms.can_send_voice_notes ?? true,
          can_send_polls: groupPerms.can_send_polls ?? true,
          can_send_other_messages: groupPerms.can_send_other_messages ?? true,
          can_add_web_page_previews: groupPerms.can_add_web_page_previews ?? true,
          can_invite_users: groupPerms.can_invite_users ?? true,
          can_pin_messages: groupPerms.can_pin_messages ?? true,
          can_manage_topics: groupPerms.can_manage_topics ?? true,
          can_change_info: groupPerms.can_change_info ?? true,
        };
        console.log('[unmute] Restoring permissions for user', userId, 'in chat', numChatId, ':', JSON.stringify(restorePerms));
        await botInstance.api.raw.restrictChatMember({
          chat_id: numChatId,
          user_id: userId,
          permissions: restorePerms,
        });
        break;
      }
      case 'ban':
        await botInstance.api.banChatMember(numChatId, userId, { until_date: untilDate || undefined });
        break;
      case 'unban':
        await botInstance.api.unbanChatMember(numChatId, userId, { only_if_banned: true });
        break;
      case 'restrict_media':
        await botInstance.api.restrictChatMember(numChatId, userId, { permissions: noMedia, until_date: untilDate || undefined, use_independent_chat_permissions: true } as any);
        break;
      case 'restrict_links':
        await botInstance.api.restrictChatMember(numChatId, userId, { permissions: noLinks, until_date: untilDate || undefined, use_independent_chat_permissions: true } as any);
        break;
    }

    logActivity({ userId: user.id, botId: id, action: `mod.${action}`, details: { targetUserId: userId, chatId, duration } });
    // Return expected new status so client can update immediately
    const newStatus = action === 'ban' ? 'kicked' : action === 'unban' || action === 'unmute' ? 'member' : action === 'mute' ? 'restricted' : 'restricted';
    return c.json({ ok: true, newStatus });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
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
