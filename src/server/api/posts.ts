import { Hono } from 'hono';
import { db } from '../db/client.js';
import { posts, channels, bots } from '../db/schema.js';
import { eq, desc, inArray } from 'drizzle-orm';
import { requireAuth } from '../auth/middleware.js';
import { botManager } from '../bot/manager.js';
import { logActivity } from '../services/activity.js';

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

  let rows = db.select().from(posts)
    .where(inArray(posts.channelId, allowedIds))
    .orderBy(desc(posts.createdAt))
    .limit(limit)
    .offset(offset)
    .all();

  if (status) rows = rows.filter((p) => p.status === status);
  if (channelId) rows = rows.filter((p) => p.channelId === Number(channelId));

  return c.json(rows);
});

// GET /api/posts/:id
postsApi.get('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const post = db.select().from(posts).where(eq(posts.id, id)).limit(1).get();
  if (!post) return c.json({ error: 'Not found' }, 404);
  return c.json(post);
});

// POST /api/posts
postsApi.post('/', async (c) => {
  const body = await c.req.json<{
    channelId: number;
    content: string;
    imageUrl?: string;
    scheduledFor?: string;
    status?: string;
  }>();

  if (!body.content?.trim()) return c.json({ error: 'Текст поста не может быть пустым' }, 400);

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
  const id = Number(c.req.param('id'));
  const body = await c.req.json<{
    content?: string;
    imageUrl?: string;
    status?: string;
    scheduledFor?: string;
  }>();

  const updated = db.update(posts)
    .set({ ...body, updatedAt: new Date().toISOString() } as any)
    .where(eq(posts.id, id))
    .returning().get();

  if (!updated) return c.json({ error: 'Not found' }, 404);
  return c.json(updated);
});

// DELETE /api/posts/:id
postsApi.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const post = db.select().from(posts).where(eq(posts.id, id)).limit(1).get();
  if (!post) return c.json({ error: 'Not found' }, 404);
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
    let messageId: number;
    if (post.imageUrl) {
      const msg = await botInstance.api.sendPhoto(channel.chatId, post.imageUrl, {
        caption: post.content,
        parse_mode: 'HTML',
      });
      messageId = msg.message_id;
    } else {
      const msg = await botInstance.api.sendMessage(channel.chatId, post.content, {
        parse_mode: 'HTML',
      });
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
  const { ids, action } = await c.req.json<{ ids: number[]; action: 'approve' | 'publish' | 'delete' }>();

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
            db.update(posts).set({ status: 'queued', updatedAt: new Date().toISOString() }).where(eq(posts.id, id)).run();
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
          const msg = post.imageUrl
            ? await botInstance.api.sendPhoto(channel.chatId, post.imageUrl, { caption: post.content, parse_mode: 'HTML' })
            : await botInstance.api.sendMessage(channel.chatId, post.content, { parse_mode: 'HTML' });

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
