import { Hono } from 'hono';
import { db } from '../db/client.js';
import { posts, channels, bots, tasks } from '../db/schema.js';
import { eq, desc, inArray, and } from 'drizzle-orm';
import { requireAuth } from '../auth/middleware.js';
import { botManager } from '../bot/manager.js';
import { logActivity } from '../services/activity.js';

/** Sanitize HTML for Telegram — only allow supported tags, escape the rest */
function sanitizeForTelegram(html: string): string {
  // Strip all tags except Telegram-supported ones
  let clean = html.replace(/<\/?(?!b|i|u|s|a|code|pre|\/b|\/i|\/u|\/s|\/a|\/code|\/pre)[^>]*>/gi, '');
  // Fix unclosed tags by stripping them
  const allowed = ['b', 'i', 'u', 's', 'code', 'pre'];
  for (const tag of allowed) {
    const opens = (clean.match(new RegExp(`<${tag}[^>]*>`, 'gi')) || []).length;
    const closes = (clean.match(new RegExp(`</${tag}>`, 'gi')) || []).length;
    // Add missing closing tags
    for (let i = 0; i < opens - closes; i++) clean += `</${tag}>`;
  }
  return clean;
}

const postsApi = new Hono();
postsApi.use('*', requireAuth);

/** Get channel IDs accessible by user */
function getAllowedChannelIds(user: any): number[] {
  if (user.role === 'superadmin') {
    return db.select({ id: channels.id }).from(channels).all().map((ch) => ch.id);
  }
  const userBots = db.select({ id: bots.id }).from(bots).where(eq(bots.ownerId, user.id)).all();
  const botIds = userBots.map((b) => b.id);
  if (botIds.length === 0) return [];
  return db.select({ id: channels.id }).from(channels).where(inArray(channels.botId, botIds)).all().map((ch) => ch.id);
}

// GET /api/posts
postsApi.get('/', async (c) => {
  const user = (c as any).get('user');
  const status = c.req.query('status');
  const channelId = c.req.query('channelId');
  const limit = Number(c.req.query('limit') || '50');
  const offset = Number(c.req.query('offset') || '0');

  const allowedIds = getAllowedChannelIds(user);
  if (allowedIds.length === 0) return c.json([]);

  // Build WHERE conditions in SQL instead of filtering in JS
  const conditions = [inArray(posts.channelId, allowedIds)];
  if (status) conditions.push(eq(posts.status, status as any));
  if (channelId) conditions.push(eq(posts.channelId, Number(channelId)));

  const rows = db.select().from(posts)
    .where(and(...conditions))
    .orderBy(desc(posts.createdAt))
    .limit(limit)
    .offset(offset)
    .all();

  // Build task name lookup — single batch query instead of N+1
  const taskIds = [...new Set(rows.filter(p => p.taskId).map(p => p.taskId!))];
  const taskNames: Record<number, string> = {};
  const defaultNames: Record<string, string> = { news_feed: '📰 Новостная лента', web_search: '🔍 Мониторинг тем', auto_reply: '🤖 Авто-ответы', welcome: '👋 Приветствие', moderation: '🛡️ Модерация' };
  if (taskIds.length > 0) {
    const taskRows = db.select().from(tasks).where(inArray(tasks.id, taskIds)).all();
    for (const t of taskRows) {
      taskNames[t.id] = t.name ?? defaultNames[t.type] ?? t.type;
    }
  }

  return c.json(rows.map(p => ({ ...p, taskName: p.taskId ? taskNames[p.taskId] ?? null : null })));
});

/** Check if user can access this post */
function checkPostAccess(user: any, post: { channelId: number }): boolean {
  return getAllowedChannelIds(user).includes(post.channelId);
}

// GET /api/posts/:id
postsApi.get('/:id', async (c) => {
  const user = (c as any).get('user');
  const id = Number(c.req.param('id'));
  const post = db.select().from(posts).where(eq(posts.id, id)).limit(1).get();
  if (!post) return c.json({ error: 'Not found' }, 404);
  if (!checkPostAccess(user, post)) return c.json({ error: 'Forbidden' }, 403);
  return c.json(post);
});

// POST /api/posts
postsApi.post('/', async (c) => {
  const user = (c as any).get('user');
  const body = await c.req.json<{
    channelId: number;
    content: string;
    imageUrl?: string;
    scheduledFor?: string;
    status?: string;
  }>();

  if (!body.content?.trim()) return c.json({ error: 'Текст поста не может быть пустым' }, 400);
  if (!getAllowedChannelIds(user).includes(body.channelId)) return c.json({ error: 'Forbidden' }, 403);

  // Normalize scheduledFor timezone — ensure UTC 'Z' suffix
  if (body.scheduledFor && !body.scheduledFor.endsWith('Z')) {
    body.scheduledFor = body.scheduledFor + 'Z';
  }

  const channel = db.select().from(channels).where(eq(channels.id, body.channelId)).limit(1).get();
  if (!channel) return c.json({ error: 'Канал не найден' }, 404);

  const created = db.insert(posts).values({
    channelId: body.channelId,
    content: body.content,
    imageUrl: body.imageUrl,
    scheduledFor: body.scheduledFor,
    status: (body.status as any) ?? 'draft',
  }).returning().get();

  return c.json(created, 201);
});

// PATCH /api/posts/:id
postsApi.patch('/:id', async (c) => {
  const user = (c as any).get('user');
  const id = Number(c.req.param('id'));

  const existing = db.select().from(posts).where(eq(posts.id, id)).limit(1).get();
  if (!existing) return c.json({ error: 'Not found' }, 404);
  if (!checkPostAccess(user, existing)) return c.json({ error: 'Forbidden' }, 403);

  const body = await c.req.json<{
    content?: string;
    imageUrl?: string;
    status?: string;
    scheduledFor?: string;
    inlineButtons?: Array<{ text: string; url: string }>;
  }>();

  // Status transition validation
  if (body.status && body.status !== existing.status) {
    const allowedTransitions: Record<string, string[]> = {
      draft: ['approved', 'queued', 'publishing'],
      approved: ['queued', 'publishing', 'draft'],
      queued: ['publishing', 'failed', 'approved'],
      publishing: ['published', 'failed'],
      published: [],
      failed: ['queued', 'draft'],
    };
    const allowed = allowedTransitions[existing.status] ?? [];
    if (!allowed.includes(body.status)) {
      return c.json({ error: `Нельзя сменить статус с "${existing.status}" на "${body.status}"` }, 400);
    }
  }

  // Normalize scheduledFor timezone — ensure UTC 'Z' suffix
  if (body.scheduledFor && !body.scheduledFor.endsWith('Z')) {
    body.scheduledFor = body.scheduledFor + 'Z';
  }

  const updated = db.update(posts)
    .set({ ...body, updatedAt: new Date().toISOString() } as any)
    .where(eq(posts.id, id))
    .returning().get();

  if (!updated) return c.json({ error: 'Not found' }, 404);
  return c.json(updated);
});

// DELETE /api/posts/:id
postsApi.delete('/:id', async (c) => {
  const user = (c as any).get('user');
  const id = Number(c.req.param('id'));
  const post = db.select().from(posts).where(eq(posts.id, id)).limit(1).get();
  if (!post) return c.json({ error: 'Not found' }, 404);
  if (!checkPostAccess(user, post)) return c.json({ error: 'Forbidden' }, 403);
  if (post.status === 'published') return c.json({ error: 'Cannot delete published post' }, 400);

  db.delete(posts).where(eq(posts.id, id)).run();
  return c.json({ ok: true });
});

// POST /api/posts/:id/publish
postsApi.post('/:id/publish', async (c) => {
  const id = Number(c.req.param('id'));

  const post = db.select().from(posts).where(eq(posts.id, id)).limit(1).get();
  if (!post) return c.json({ error: 'Not found' }, 404);
  if (post.status === 'published') return c.json({ error: 'Already published' }, 400);

  const channel = db.select().from(channels).where(eq(channels.id, post.channelId)).limit(1).get();
  if (!channel) return c.json({ error: 'Channel not found' }, 404);

  const botInstance = botManager.getBotInstance(channel.botId);
  if (!botInstance) return c.json({ error: 'Bot is not running' }, 400);

  db.update(posts).set({ status: 'publishing' }).where(eq(posts.id, id)).run();

  try {
    // Build content with signature, sanitize for Telegram
    const bot = db.select().from(bots).where(eq(bots.id, channel.botId)).limit(1).get();
    let content = sanitizeForTelegram(post.content);
    if (bot?.postSignature) content += '\n\n' + bot.postSignature;

    // Inline keyboard
    let reply_markup: any = undefined;
    const buttons = post.inlineButtons as Array<{ text: string; url: string }> | null;
    if (buttons?.length) {
      reply_markup = { inline_keyboard: [buttons.map((b: any) => ({ text: b.text, url: b.url }))] };
    }

    const sendOpts: any = { parse_mode: 'HTML' as const, message_thread_id: channel.threadId ?? undefined, reply_markup };

    let messageId: number;
    if (post.imageUrl) {
      const msg = await botInstance.api.sendPhoto(channel.chatId, post.imageUrl, { caption: content, ...sendOpts });
      messageId = msg.message_id;
    } else {
      const msg = await botInstance.api.sendMessage(channel.chatId, content, sendOpts);
      messageId = msg.message_id;
    }

    db.update(posts)
      .set({
        status: 'published',
        publishedAt: new Date().toISOString(),
        telegramMessageId: messageId,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(posts.id, id))
      .run();

    logActivity({ userId: (c as any).get('user')?.id, botId: channel.botId, action: 'post.published', details: { postId: id, channelTitle: channel.title } });
    return c.json({ ok: true, messageId });
  } catch (err) {
    db.update(posts)
      .set({ status: 'failed', errorMessage: (err as Error).message, updatedAt: new Date().toISOString() })
      .where(eq(posts.id, id))
      .run();

    return c.json({ error: (err as Error).message }, 500);
  }
});

// POST /api/posts/bulk — bulk operations
postsApi.post('/bulk', async (c) => {
  const { ids, action, scheduledFor } = await c.req.json<{ ids: number[]; action: 'approve' | 'schedule' | 'publish' | 'delete'; scheduledFor?: string }>();

  if (!ids?.length) return c.json({ error: 'Не выбраны посты' }, 400);

  let ok = 0;
  let failed = 0;

  for (const id of ids) {
    const post = db.select().from(posts).where(eq(posts.id, id)).limit(1).get();
    if (!post) { failed++; continue; }

    try {
      switch (action) {
        case 'approve':
          if (post.status === 'draft') {
            db.update(posts).set({ status: 'approved', updatedAt: new Date().toISOString() }).where(eq(posts.id, id)).run();
            ok++;
          } else { failed++; }
          break;

        case 'schedule':
          if (post.status === 'draft' || post.status === 'approved') {
            db.update(posts).set({ status: 'queued', scheduledFor: scheduledFor ?? null, updatedAt: new Date().toISOString() }).where(eq(posts.id, id)).run();
            ok++;
          } else { failed++; }
          break;

        case 'publish': {
          if (post.status === 'published') { failed++; break; }
          const channel = db.select().from(channels).where(eq(channels.id, post.channelId)).limit(1).get();
          if (!channel) { failed++; break; }
          const botInstance = botManager.getBotInstance(channel.botId);
          if (!botInstance) { failed++; break; }

          db.update(posts).set({ status: 'publishing' }).where(eq(posts.id, id)).run();

          const bot = db.select().from(bots).where(eq(bots.id, channel.botId)).limit(1).get();
          let content = sanitizeForTelegram(post.content);
          if (bot?.postSignature) content += '\n\n' + bot.postSignature;
          let reply_markup: any = undefined;
          const btns = post.inlineButtons as Array<{ text: string; url: string }> | null;
          if (btns?.length) reply_markup = { inline_keyboard: [btns.map((b: any) => ({ text: b.text, url: b.url }))] };
          const opts: any = { parse_mode: 'HTML' as const, message_thread_id: channel.threadId ?? undefined, reply_markup };

          const msg = post.imageUrl
            ? await botInstance.api.sendPhoto(channel.chatId, post.imageUrl, { caption: content, ...opts })
            : await botInstance.api.sendMessage(channel.chatId, content, opts);

          db.update(posts).set({ status: 'published', publishedAt: new Date().toISOString(), telegramMessageId: msg.message_id, updatedAt: new Date().toISOString() }).where(eq(posts.id, id)).run();
          ok++;
          break;
        }

        case 'delete':
          if (post.status !== 'published') {
            db.delete(posts).where(eq(posts.id, id)).run();
            ok++;
          } else { failed++; }
          break;
      }
    } catch {
      failed++;
    }
  }

  return c.json({ ok, failed, total: ids.length });
});

export { postsApi };
