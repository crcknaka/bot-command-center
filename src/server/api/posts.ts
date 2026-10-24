import { Hono } from 'hono';
import { db } from '../db/client.js';
import { posts, channels, bots, tasks } from '../db/schema.js';
import { eq, desc, inArray, and, or } from 'drizzle-orm';
import { requireAuth } from '../auth/middleware.js';
import { publishPostNow, editPublishedPost, deletePublishedMessage, sendTestMessage, PublishError } from '../services/publish.js';

/** Calculate next available time slot for a channel based on existing scheduled/published posts */
function calculateNextSlot(channelId: number, taskId?: number | null): string {
  const channel = db.select().from(channels).where(eq(channels.id, channelId)).limit(1).get();
  const bot = channel ? db.select().from(bots).where(eq(bots.id, channel.botId)).limit(1).get() : null;
  // Task-level interval > bot-level > default 60
  let intervalMinutes = bot?.minPostIntervalMinutes ?? 60;
  if (taskId) {
    const task = db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1).get();
    const taskInterval = (task?.config as any)?.postIntervalMinutes;
    if (taskInterval && taskInterval > 0) intervalMinutes = taskInterval;
  }

  // Find the latest scheduled or recently published post
  const lastScheduled = db.select().from(posts)
    .where(and(eq(posts.channelId, channelId), or(eq(posts.status, 'queued'), eq(posts.status, 'published'))))
    .orderBy(desc(posts.scheduledFor))
    .limit(1).get();

  const now = new Date();
  let nextSlot: Date;

  if (lastScheduled?.scheduledFor) {
    const lastTime = new Date(lastScheduled.scheduledFor);
    nextSlot = new Date(lastTime.getTime() + intervalMinutes * 60000);
    if (nextSlot < now) nextSlot = new Date(now.getTime() + 60000);
  } else {
    nextSlot = new Date(now.getTime() + 60000);
  }

  return nextSlot.toISOString();
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
    // New posts can only be drafts or queued — sending always goes through /publish
    status: body.status === 'queued' ? 'queued' : 'draft',
  }).returning().get();

  return c.json(created, 201);
});

// POST /api/posts/test-send — send the text to a chat as a check, without saving a post
postsApi.post('/test-send', async (c) => {
  const user = (c as any).get('user');
  const body = await c.req.json<{ channelId: number; content: string; imageUrl?: string }>();

  if (!body.content?.trim()) return c.json({ error: 'Текст поста не может быть пустым' }, 400);
  if (!getAllowedChannelIds(user).includes(body.channelId)) return c.json({ error: 'Forbidden' }, 403);

  try {
    const messageId = await sendTestMessage(body.channelId, body.content, body.imageUrl);
    return c.json({ ok: true, messageId });
  } catch (err) {
    return c.json({ error: (err as Error).message }, err instanceof PublishError ? err.status : 500);
  }
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
    imageUrl?: string | null;
    status?: string;
    scheduledFor?: string | null;
    inlineButtons?: Array<{ text: string; url: string }>;
  }>();

  // Only the transitions a person makes; publishing/published/failed are set by the publisher
  if (body.status && body.status !== existing.status) {
    const allowedTransitions: Record<string, string[]> = {
      draft: ['queued'],
      queued: ['draft'],
      failed: ['queued', 'draft'],
    };
    const allowed = allowedTransitions[existing.status] ?? [];
    if (!allowed.includes(body.status)) {
      return c.json({ error: `Нельзя сменить статус с "${existing.status}" на "${body.status}"` }, 400);
    }
  }
  if (existing.status === 'published' && body.content !== undefined && body.content !== existing.content) {
    return c.json({ error: 'Пост уже в канале — меняйте его через «Изменить в Telegram»' }, 400);
  }

  // Normalize scheduledFor timezone — ensure UTC 'Z' suffix
  if (body.scheduledFor && !body.scheduledFor.endsWith('Z')) {
    body.scheduledFor = body.scheduledFor + 'Z';
  }

  // Explicit field list: the body must not reach columns like channelId or telegramMessageId
  const changes: Partial<typeof posts.$inferInsert> = { updatedAt: new Date().toISOString() };
  if (body.content !== undefined) changes.content = body.content;
  if (body.imageUrl !== undefined) changes.imageUrl = body.imageUrl;
  if (body.status !== undefined) changes.status = body.status as any;
  if (body.scheduledFor !== undefined) changes.scheduledFor = body.scheduledFor;
  if (body.inlineButtons !== undefined) changes.inlineButtons = body.inlineButtons;

  const updated = db.update(posts)
    .set(changes)
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

  // ?telegram=1 also removes the message from the channel
  if (c.req.query('telegram') === '1') {
    try {
      await deletePublishedMessage(post, user.id);
    } catch (err) {
      return c.json({ error: (err as Error).message }, err instanceof PublishError ? err.status : 500);
    }
  }

  db.delete(posts).where(eq(posts.id, id)).run();
  return c.json({ ok: true });
});

// POST /api/posts/:id/edit-published — change the text of a post that is already in the channel
postsApi.post('/:id/edit-published', async (c) => {
  const user = (c as any).get('user');
  const id = Number(c.req.param('id'));
  const { content } = await c.req.json<{ content: string }>();
  if (!content?.trim()) return c.json({ error: 'Текст поста не может быть пустым' }, 400);

  const post = db.select().from(posts).where(eq(posts.id, id)).limit(1).get();
  if (!post) return c.json({ error: 'Not found' }, 404);
  if (!checkPostAccess(user, post)) return c.json({ error: 'Forbidden' }, 403);

  try {
    await editPublishedPost(post, content, user.id);
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: (err as Error).message }, err instanceof PublishError ? err.status : 500);
  }
});

// POST /api/posts/:id/publish
postsApi.post('/:id/publish', async (c) => {
  const user = (c as any).get('user');
  const id = Number(c.req.param('id'));

  const post = db.select().from(posts).where(eq(posts.id, id)).limit(1).get();
  if (!post) return c.json({ error: 'Not found' }, 404);
  if (!checkPostAccess(user, post)) return c.json({ error: 'Forbidden' }, 403);

  try {
    const messageId = await publishPostNow(id, user.id);
    return c.json({ ok: true, messageId });
  } catch (err) {
    return c.json({ error: (err as Error).message }, err instanceof PublishError ? err.status : 500);
  }
});

// POST /api/posts/:id/enqueue — auto-calculate slot and queue
postsApi.post('/:id/enqueue', async (c) => {
  const user = (c as any).get('user');
  const id = Number(c.req.param('id'));
  const post = db.select().from(posts).where(eq(posts.id, id)).limit(1).get();
  if (!post) return c.json({ error: 'Not found' }, 404);
  if (!checkPostAccess(user, post)) return c.json({ error: 'Forbidden' }, 403);
  if (post.status !== 'draft') return c.json({ error: 'Только черновики можно поставить в очередь' }, 400);

  const slot = calculateNextSlot(post.channelId, post.taskId);
  const updated = db.update(posts)
    .set({ status: 'queued', scheduledFor: slot, updatedAt: new Date().toISOString() })
    .where(eq(posts.id, id))
    .returning().get();

  return c.json({ ok: true, scheduledFor: slot, post: updated });
});

// POST /api/posts/bulk — bulk operations
postsApi.post('/bulk', async (c) => {
  const user = (c as any).get('user');
  const { ids, action, scheduledFor } = await c.req.json<{ ids: number[]; action: 'enqueue' | 'schedule' | 'publish' | 'delete'; scheduledFor?: string }>();

  if (!ids?.length) return c.json({ error: 'Не выбраны посты' }, 400);

  let ok = 0;
  let failed = 0;

  for (const id of ids) {
    const post = db.select().from(posts).where(eq(posts.id, id)).limit(1).get();
    if (!post) { failed++; continue; }
    if (!checkPostAccess(user, post)) { failed++; continue; }

    try {
      switch (action) {
        case 'enqueue':
          if (post.status === 'draft') {
            const slot = calculateNextSlot(post.channelId, post.taskId);
            db.update(posts).set({ status: 'queued', scheduledFor: slot, updatedAt: new Date().toISOString() }).where(eq(posts.id, id)).run();
            ok++;
          } else { failed++; }
          break;

        case 'schedule':
          if (post.status === 'draft') {
            db.update(posts).set({ status: 'queued', scheduledFor: scheduledFor ?? null, updatedAt: new Date().toISOString() }).where(eq(posts.id, id)).run();
            ok++;
          } else { failed++; }
          break;

        case 'publish':
          await publishPostNow(id, user.id);
          ok++;
          break;

        case 'delete':
          db.delete(posts).where(eq(posts.id, id)).run();
          ok++;
          break;
      }
    } catch {
      failed++;
    }
  }

  return c.json({ ok, failed, total: ids.length });
});

export { postsApi };
