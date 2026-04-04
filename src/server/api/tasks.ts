import { Hono } from 'hono';
import { db } from '../db/client.js';
import { tasks, sources, channels, bots } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../auth/middleware.js';
import { getTaskModule, getAvailableTaskTypes } from '../tasks/registry.js';
import { fetchAndStore, fetchOnly } from '../tasks/news-feed/fetcher.js';
import { botManager } from '../bot/manager.js';
import cron from 'node-cron';

/** Restart the bot that owns this channel (so new handlers register) */
async function restartBotForChannel(channelId: number) {
  const channel = db.select().from(channels).where(eq(channels.id, channelId)).limit(1).get();
  if (!channel) return;
  if (botManager.isRunning(channel.botId)) {
    try {
      await botManager.restartBot(channel.botId);
      console.log(`🔄 Bot ${channel.botId} auto-restarted after task change`);
    } catch (e) { console.error('[tasks] auto-restart error:', e); }
  }
}

const tasksApi = new Hono();
tasksApi.use('*', requireAuth);

// GET /api/task-types — list available task types
tasksApi.get('/task-types', async (c) => {
  return c.json(getAvailableTaskTypes());
});

// GET /api/channels/:channelId/tasks
tasksApi.get('/channels/:channelId/tasks', async (c) => {
  const channelId = Number(c.req.param('channelId'));
  const rows = db.select().from(tasks).where(eq(tasks.channelId, channelId)).all();
  return c.json(rows);
});

// POST /api/channels/:channelId/tasks
tasksApi.post('/channels/:channelId/tasks', async (c) => {
  const channelId = Number(c.req.param('channelId'));
  const body = await c.req.json<{
    name?: string;
    type: string;
    config?: Record<string, unknown>;
    schedule?: string;
    enabled?: boolean;
  }>();

  getTaskModule(body.type);

  if (body.schedule && !cron.validate(body.schedule)) {
    return c.json({ error: `Неверное cron-выражение: ${body.schedule}` }, 400);
  }

  const created = db.insert(tasks).values({
    channelId,
    name: body.name ?? null,
    type: body.type as any,
    config: body.config ?? {},
    schedule: body.schedule,
    enabled: body.enabled ?? true,
  }).returning().get();

  await restartBotForChannel(channelId);
  return c.json(created, 201);
});

// PATCH /api/tasks/:id
tasksApi.patch('/tasks/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json<{
    config?: Record<string, unknown>;
    schedule?: string;
    enabled?: boolean;
    channelId?: number; // move task to another channel
  }>();

  if (body.schedule && !cron.validate(body.schedule)) {
    return c.json({ error: `Неверное cron-выражение: ${body.schedule}` }, 400);
  }

  // If moving to another channel, restart both old and new bots
  const oldTask = body.channelId ? db.select().from(tasks).where(eq(tasks.id, id)).limit(1).get() : null;

  const updated = db.update(tasks).set(body as any).where(eq(tasks.id, id)).returning().get();
  if (!updated) return c.json({ error: 'Not found' }, 404);

  if (oldTask && oldTask.channelId !== updated.channelId) {
    await restartBotForChannel(oldTask.channelId);
  }
  await restartBotForChannel(updated.channelId);
  return c.json(updated);
});

// POST /api/tasks/:id/duplicate — duplicate task with all sources
tasksApi.post('/tasks/:id/duplicate', async (c) => {
  const id = Number(c.req.param('id'));
  const task = db.select().from(tasks).where(eq(tasks.id, id)).limit(1).get();
  if (!task) return c.json({ error: 'Не найден' }, 404);

  const newTask = db.insert(tasks).values({
    channelId: task.channelId,
    name: task.name ? `${task.name} (копия)` : null,
    type: task.type as any,
    config: task.config,
    enabled: false, // start disabled
    schedule: task.schedule,
  }).returning().get();

  // Duplicate sources
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

  return c.json(newTask, 201);
});

// DELETE /api/tasks/:id
tasksApi.delete('/tasks/:id', async (c) => {
  const user = (c as any).get('user');
  const id = Number(c.req.param('id'));
  const task = db.select().from(tasks).where(eq(tasks.id, id)).limit(1).get();
  if (!task) return c.json({ error: 'Не найден' }, 404);
  if (user.role !== 'superadmin') {
    const ch = db.select().from(channels).where(eq(channels.id, task.channelId)).limit(1).get();
    const bot = ch ? db.select().from(bots).where(eq(bots.id, ch.botId)).limit(1).get() : null;
    if (!bot || bot.ownerId !== user.id) return c.json({ error: 'Нет доступа' }, 403);
  }
  const channelId = task.channelId;
  db.delete(tasks).where(eq(tasks.id, id)).run();
  await restartBotForChannel(channelId);
  return c.json({ ok: true });
});

// POST /api/tasks/:id/run — manually trigger onSchedule
tasksApi.post('/tasks/:id/run', async (c) => {
  const id = Number(c.req.param('id'));

  const task = db.select().from(tasks).where(eq(tasks.id, id)).limit(1).get();
  if (!task) return c.json({ error: 'Not found' }, 404);

  const channel = db.select().from(channels).where(eq(channels.id, task.channelId)).limit(1).get();
  if (!channel) return c.json({ error: 'Channel not found' }, 404);

  const module = getTaskModule(task.type);

  try {
    const result = await module.onSchedule({
      taskId: task.id,
      channelId: channel.id,
      chatId: channel.chatId,
      config: task.config as Record<string, unknown>,
      bot: null as any,
    });
    return c.json({ ok: true, ...result });
  } catch (err) {
    return c.json({ ok: false, error: (err as Error).message, steps: [{ action: 'Запуск задачи', status: 'error', detail: (err as Error).message }] }, 500);
  }
});

// POST /api/tasks/:id/preview — show what articles will be processed (without generating)
tasksApi.post('/tasks/:id/preview', async (c) => {
  const id = Number(c.req.param('id'));
  const task = db.select().from(tasks).where(eq(tasks.id, id)).limit(1).get();
  if (!task) return c.json({ error: 'Not found' }, 404);

  const config = task.config as any;
  const maxAgeDays = config?.maxAgeDays ?? 7;

  // Fetch from all sources (store in DB like normal run)
  const taskSources = db.select().from(sources).where(eq(sources.taskId, id)).all();
  for (const source of taskSources) {
    if (source.enabled) {
      try { await fetchAndStore(source.id, maxAgeDays); } catch {}
    }
  }

  // Get articles that would be processed
  const { articles } = await import('../db/schema.js');
  const { posts: postsTable } = await import('../db/schema.js');
  const allArticles = taskSources.flatMap((src) =>
    db.select().from(articles).where(eq(articles.sourceId, src.id)).all()
  );

  // Apply keyword filter
  const keywords: string[] = config?.filterKeywords?.filter((k: string) => k.trim()) ?? [];
  const filtered = keywords.length > 0
    ? allArticles.filter((a) => {
        const text = `${a.title} ${a.summary ?? ''} ${a.content ?? ''}`.toLowerCase();
        return keywords.some((kw) => text.includes(kw.toLowerCase()));
      })
    : allArticles;

  // Only unprocessed
  const unprocessed = filtered.filter((article) => {
    const existing = db.select({ id: postsTable.id }).from(postsTable)
      .where(eq(postsTable.articleId, article.id)).limit(1).get();
    return !existing;
  });

  const channel = db.select().from(channels).where(eq(channels.id, task.channelId)).limit(1).get();
  const bot = channel ? db.select().from(bots).where(eq(bots.id, channel.botId)).limit(1).get() : null;
  const maxPerDay = bot?.maxPostsPerDay ?? 5;

  return c.json({
    total: allArticles.length,
    filtered: filtered.length,
    available: unprocessed.length,
    limit: maxPerDay,
    articles: unprocessed.slice(0, maxPerDay).map((a) => ({
      id: a.id,
      title: a.title,
      summary: (a.summary ?? '').slice(0, 300),
      url: a.url,
      imageUrl: a.imageUrl,
      author: a.author,
      publishedAt: a.publishedAt,
    })),
  });
});

// POST /api/tasks/:id/test-ai — generate 1 AI post without saving
tasksApi.post('/tasks/:id/test-ai', async (c) => {
  const id = Number(c.req.param('id'));
  const task = db.select().from(tasks).where(eq(tasks.id, id)).limit(1).get();
  if (!task) return c.json({ error: 'Not found' }, 404);

  const config = task.config as any;
  const channel = db.select().from(channels).where(eq(channels.id, task.channelId)).limit(1).get();
  const bot = channel ? db.select().from(bots).where(eq(bots.id, channel.botId)).limit(1).get() : null;

  // Get first unprocessed article
  const { articles, posts: postsTable } = await import('../db/schema.js');
  const taskSources = db.select().from(sources).where(eq(sources.taskId, id)).all();

  // Fetch fresh articles first
  for (const source of taskSources) {
    if (source.enabled) {
      try { await fetchAndStore(source.id, config.maxAgeDays ?? 7); } catch {}
    }
  }

  const allArticles = taskSources.flatMap((src) =>
    db.select().from(articles).where(eq(articles.sourceId, src.id)).all()
  );

  // Apply keyword filter
  const keywords: string[] = config?.filterKeywords?.filter((k: string) => k.trim()) ?? [];
  const filtered = keywords.length > 0
    ? allArticles.filter((a) => {
        const text = `${a.title} ${a.summary ?? ''} ${a.content ?? ''}`.toLowerCase();
        return keywords.some((kw) => text.includes(kw.toLowerCase()));
      })
    : allArticles;

  const unprocessed = filtered.filter((article) => {
    const existing = db.select({ id: postsTable.id }).from(postsTable)
      .where(eq(postsTable.articleId, article.id)).limit(1).get();
    return !existing;
  });

  if (unprocessed.length === 0) {
    return c.json({ error: 'Нет статей для тестирования. Добавьте источники и нажмите «Превью».' }, 400);
  }

  const article = unprocessed[0];
  const { resolveProvider, resolveModel } = await import('../services/ai/provider.js');
  const { generatePost } = await import('../services/ai/generate.js');

  const provider = resolveProvider({ taskConfigProviderId: config.aiProviderId, botId: bot?.id, ownerId: bot?.ownerId });
  if (!provider) {
    return c.json({ error: 'AI-провайдер не настроен. Добавьте в Настройки → AI-модели.' }, 400);
  }

  const lang = config.postLanguage ?? bot?.postLanguage ?? 'Russian';
  const maxLen = config.postMaxLength ?? bot?.maxPostLength ?? 2000;
  const modelId = resolveModel(config.aiModel, provider.id);
  const systemPrompt = config.systemPrompt ?? 'You are a professional Telegram channel editor. Create engaging, concise posts using HTML formatting (<b>, <i>, <a href="">). Include relevant emoji sparingly. Always include the source link at the end.';

  try {
    const generated = await generatePost({
      providerId: provider.id, modelId, systemPrompt,
      userPrompt: `Create a Telegram post based on this article:\n\nTitle: ${article.title}\nContent: ${article.content ?? article.summary ?? ''}\nURL: ${article.url}\n\nLanguage: ${lang}\nMax length: ${maxLen} characters`,
    });

    return c.json({
      ok: true,
      article: { title: article.title, url: article.url, imageUrl: article.imageUrl },
      post: generated.content,
      model: modelId,
      tokensUsed: generated.tokensUsed,
    });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

// ── Sources sub-routes ──────────────────────────────────────────────────────

// GET /api/tasks/:taskId/sources
tasksApi.get('/tasks/:taskId/sources', async (c) => {
  const taskId = Number(c.req.param('taskId'));
  const rows = db.select().from(sources).where(eq(sources.taskId, taskId)).all();
  return c.json(rows);
});

// POST /api/tasks/:taskId/sources
tasksApi.post('/tasks/:taskId/sources', async (c) => {
  const taskId = Number(c.req.param('taskId'));
  const body = await c.req.json<{
    type: string;
    url: string;
    name: string;
  }>();

  const created = db.insert(sources).values({
    taskId,
    type: body.type as any,
    url: body.url,
    name: body.name,
  }).returning().get();

  return c.json(created, 201);
});

// DELETE /api/sources/:id
tasksApi.delete('/sources/:id', async (c) => {
  const user = (c as any).get('user');
  const id = Number(c.req.param('id'));
  const source = db.select().from(sources).where(eq(sources.id, id)).limit(1).get();
  if (!source) return c.json({ error: 'Не найден' }, 404);
  if (user.role !== 'superadmin') {
    const task = db.select().from(tasks).where(eq(tasks.id, source.taskId)).limit(1).get();
    const ch = task ? db.select().from(channels).where(eq(channels.id, task.channelId)).limit(1).get() : null;
    const bot = ch ? db.select().from(bots).where(eq(bots.id, ch.botId)).limit(1).get() : null;
    if (!bot || bot.ownerId !== user.id) return c.json({ error: 'Нет доступа' }, 403);
  }
  db.delete(sources).where(eq(sources.id, id)).run();
  return c.json({ ok: true });
});

// POST /api/sources/:id/fetch — test source (fetch without storing, respects date filter)
tasksApi.post('/sources/:id/fetch', async (c) => {
  const id = Number(c.req.param('id'));
  try {
    let allArticles = await fetchOnly(id);

    // Get task config for filters
    const source = db.select().from(sources).where(eq(sources.id, id)).limit(1).get();
    const task = source ? db.select().from(tasks).where(eq(tasks.id, source.taskId)).limit(1).get() : null;
    const maxAgeDays = (task?.config as any)?.maxAgeDays ?? 7;

    // Apply date filter (same as fetchAndStore)
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    const totalBeforeDate = allArticles.length;
    allArticles = allArticles.filter((a) => {
      if (!a.publishedAt) return source?.type === 'web';
      const pubDate = new Date(a.publishedAt).getTime();
      return !isNaN(pubDate) && pubDate >= cutoff;
    });

    // Apply keyword filter
    const keywords: string[] = (task?.config as any)?.filterKeywords?.filter((k: string) => k.trim()) ?? [];
    let filterInfo: { total: number; matched: number; keywords: string[]; skippedOld: number } | undefined;
    const skippedOld = totalBeforeDate - allArticles.length;

    if (keywords.length > 0) {
      const matched = allArticles.filter((a) => {
        const text = `${a.title} ${a.summary ?? ''} ${a.content ?? ''}`.toLowerCase();
        return keywords.some((kw) => text.includes(kw.toLowerCase()));
      });
      filterInfo = { total: allArticles.length, matched: matched.length, keywords, skippedOld };
    } else if (skippedOld > 0) {
      filterInfo = { total: allArticles.length, matched: allArticles.length, keywords: [], skippedOld };
    }

    return c.json({ ok: true, totalArticles: allArticles.length, filterInfo });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

export { tasksApi };
