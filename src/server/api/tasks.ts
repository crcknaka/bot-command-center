import { Hono } from 'hono';
import { db } from '../db/client.js';
import { tasks, sources, channels, bots } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../auth/middleware.js';
import { getTaskModule, getAvailableTaskTypes } from '../tasks/registry.js';
import { fetchAndStore, fetchOnly } from '../tasks/news-feed/fetcher.js';
import { botManager } from '../bot/manager.js';
import { buildSystemPrompt } from '../tasks/prompts.js';
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
    const createdPostIds = result.steps.filter(s => s.status === 'ok' && s.postId).map(s => s.postId);
    return c.json({ ok: true, ...result, createdPostIds });
  } catch (err) {
    return c.json({ ok: false, error: (err as Error).message, steps: [{ action: 'Запуск задачи', status: 'error', detail: (err as Error).message }] }, 500);
  }
});

// POST /api/tasks/:id/preview — show what will be processed (without generating)
tasksApi.post('/tasks/:id/preview', async (c) => {
  const id = Number(c.req.param('id'));
  const task = db.select().from(tasks).where(eq(tasks.id, id)).limit(1).get();
  if (!task) return c.json({ error: 'Not found' }, 404);

  // Web search preview — do a live search and show results
  if (task.type === 'web_search') {
    const config = task.config as any;
    const queries: string[] = config?.queries?.filter((q: string) => q.trim()) ?? [];
    if (queries.length === 0) return c.json({ total: 0, filtered: 0, available: 0, limit: 0, articles: [] });

    const { searchWeb } = await import('../services/search.js');
    const channel = db.select().from(channels).where(eq(channels.id, task.channelId)).limit(1).get();
    const bot = channel ? db.select().from(bots).where(eq(bots.id, channel.botId)).limit(1).get() : null;
    const maxPerDay = bot?.maxPostsPerDay ?? 5;

    const lang = config?.postLanguage ?? bot?.postLanguage ?? 'Russian';
    const searchResults = await Promise.allSettled(
      queries.map(query => searchWeb({ query, maxResults: config.maxResults ?? 3, timeRange: config.timeRange ?? 'day', botId: bot?.id, language: lang, searchLang: config?.searchLang, searchCountry: config?.searchCountry, searchCountries: config?.searchCountries, includeDomains: config?.includeDomains }))
    );
    const allResults: Array<{ title: string; summary: string; url: string; imageUrl?: string }> = [];
    for (const result of searchResults) {
      if (result.status === 'fulfilled') {
        for (const r of result.value) {
          allResults.push({ title: r.title, summary: (r.content ?? '').slice(0, 300), url: r.url, imageUrl: r.imageUrl });
        }
      }
    }

    return c.json({
      total: allResults.length,
      filtered: allResults.length,
      available: allResults.length,
      limit: maxPerDay,
      articles: allResults.slice(0, maxPerDay).map((a, i) => ({ id: i, title: a.title, summary: a.summary, url: a.url, imageUrl: a.imageUrl })),
    });
  }

  // News feed preview — check sources/articles (read-only, no DB writes)
  const config = task.config as any;
  const maxAgeDays = config?.maxAgeDays ?? 7;

  const taskSources = db.select().from(sources).where(eq(sources.taskId, id)).all();

  // Fetch fresh articles without storing in DB
  const freshArticlesBySource = new Map<number, any[]>();
  for (const source of taskSources) {
    if (source.enabled) {
      try {
        const fetched = await fetchOnly(source.id);
        freshArticlesBySource.set(source.id, fetched);
      } catch {}
    }
  }

  // Combine stored articles + fresh (deduplicate by URL)
  const { articles } = await import('../db/schema.js');
  const { posts: postsTable } = await import('../db/schema.js');
  const storedArticles = taskSources.flatMap((src) =>
    db.select().from(articles).where(eq(articles.sourceId, src.id)).all()
  );
  const storedUrls = new Set(storedArticles.map(a => a.url));
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const freshExtras: any[] = [];
  for (const [, fetched] of freshArticlesBySource) {
    for (const a of fetched) {
      if (storedUrls.has(a.url)) continue;
      if (a.publishedAt) {
        const pubDate = new Date(a.publishedAt).getTime();
        if (!isNaN(pubDate) && pubDate < cutoff) continue;
      }
      freshExtras.push({ ...a, id: `fresh-${freshExtras.length}`, title: a.title ?? '', summary: a.summary ?? '', content: a.content ?? '' });
      storedUrls.add(a.url);
    }
  }
  const allArticles = [...storedArticles, ...freshExtras];

  // Apply keyword filter
  const keywords: string[] = config?.filterKeywords?.filter((k: string) => k.trim()) ?? [];
  const filtered = keywords.length > 0
    ? allArticles.filter((a: any) => {
        const text = `${a.title} ${a.summary ?? ''} ${a.content ?? ''}`.toLowerCase();
        return keywords.some((kw: string) => text.includes(kw.toLowerCase()));
      })
    : allArticles;

  // Only unprocessed (fresh articles are always unprocessed)
  const unprocessed = filtered.filter((article: any) => {
    if (typeof article.id === 'string' && article.id.startsWith('fresh-')) return true;
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

  // ── Web search: test AI from preview articles ──
  if (task.type === 'web_search') {
    const body = await c.req.json<{ articles?: any[] }>().catch(() => ({}));
    const { resolveProvider, resolveModel } = await import('../services/ai/provider.js');
    const { generatePostFromSearch } = await import('../services/ai/generate.js');

    const lang = config.postLanguage ?? bot?.postLanguage ?? 'Russian';
    const provider = resolveProvider({ taskConfigProviderId: config.aiProviderId, botId: bot?.id, ownerId: bot?.ownerId });
    if (!provider) return c.json({ error: 'AI-провайдер не настроен. Добавьте в Настройки → AI-модели.' }, 400);

    // Use articles from preview (passed in body), or fallback to live search
    let searchResults: Array<{ title: string; content: string; url: string; imageUrl?: string }>;
    let topic: string;

    if ((body as any).articles?.length) {
      searchResults = (body as any).articles.map((a: any) => ({ title: a.title, content: a.summary ?? '', url: a.url, imageUrl: a.imageUrl }));
      topic = searchResults.map(r => r.title).slice(0, 2).join(', ');
    } else {
      const queries: string[] = config?.queries?.filter((q: string) => q.trim()) ?? [];
      if (queries.length === 0) return c.json({ error: 'Нет поисковых запросов.' }, 400);
      const { searchWeb } = await import('../services/search.js');
      topic = queries[0];
      searchResults = await searchWeb({ query: topic, maxResults: config.maxResults ?? 3, timeRange: config.timeRange ?? 'day', botId: bot?.id, language: lang, searchLang: config?.searchLang, searchCountries: config?.searchCountries, includeDomains: config?.includeDomains });
      if (searchResults.length === 0) return c.json({ error: `По запросу "${topic}" ничего не найдено.` }, 400);
    }

    const modelId = resolveModel(config.aiModel, provider.id);
    const systemPrompt = buildSystemPrompt(config.systemPrompt);
    const maxLen = config.postMaxLength ?? bot?.maxPostLength ?? 2000;

    try {
      const generated = await generatePostFromSearch({ providerId: provider.id, modelId, systemPrompt, searchResults, topic, language: lang, maxLength: maxLen });

      const sourcesText = searchResults.map((r, i) => `[${i + 1}] ${r.title}\n${r.content?.slice(0, 200)}\nURL: ${r.url}`).join('\n\n');

      return c.json({
        ok: true,
        article: { title: topic, summary: searchResults.map(r => r.title).join(' · '), url: searchResults[0]?.url, imageUrl: searchResults[0]?.imageUrl },
        aiInput: `System prompt:\n${systemPrompt}\n\nТема: ${topic}\nЯзык: ${lang}\nМакс. длина: ${maxLen}\n\nИсточники (${searchResults.length}):\n${sourcesText}`,
        post: generated.content,
        model: modelId,
        tokensUsed: generated.tokensUsed,
      });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500);
    }
  }

  // ── News feed: test AI from articles ──
  const body = await c.req.json<{ articles?: any[] }>().catch(() => ({}));

  // Articles must come from preview (no auto-fetching)
  if (!(body as any).articles?.length) {
    return c.json({ error: 'Нажмите «Превью» чтобы загрузить статьи, затем «Тест AI».' }, 400);
  }

  const art = (body as any).articles[0];
  const { resolveProvider, resolveModel } = await import('../services/ai/provider.js');
  const { generatePost } = await import('../services/ai/generate.js');

  const provider = resolveProvider({ taskConfigProviderId: config.aiProviderId, botId: bot?.id, ownerId: bot?.ownerId });
  if (!provider) {
    return c.json({ error: 'AI-провайдер не настроен. Добавьте в Настройки → AI-модели.' }, 400);
  }

  const lang = config.postLanguage ?? bot?.postLanguage ?? 'Russian';
  const maxLen = config.postMaxLength ?? bot?.maxPostLength ?? 2000;
  const modelId = resolveModel(config.aiModel, provider.id);
  const systemPrompt = buildSystemPrompt(config.systemPrompt);

  const articleContent = art.content ?? art.summary ?? '';
  const userPrompt = articleContent.trim()
    ? `Перепиши эту статью в пост для Telegram-канала:\n\nЗаголовок: ${art.title}\nТекст: ${articleContent}\nИсточник: ${art.url}\n${art.author ? `Автор: ${art.author}` : ''}\n\nЯзык: ${lang}\nМаксимум ${maxLen} символов. Сохрани ключевые факты. Добавь ссылку на источник.`
    : `Напиши пост для Telegram-канала на основе этого заголовка:\n\nЗаголовок: ${art.title}\nСсылка: ${art.url}\n${art.author ? `Автор/Источник: ${art.author}` : ''}\n\nЯзык: ${lang}\nМаксимум ${maxLen} символов. Используй только информацию из заголовка — НЕ выдумывай факты. Если информации мало — напиши кратко. Добавь ссылку.`;

  try {
    const generated = await generatePost({
      providerId: provider.id, modelId, systemPrompt, userPrompt,
    });

    return c.json({
      ok: true,
      article: art,
      aiInput: `System:\n${systemPrompt}\n\nUser:\n${userPrompt}`,
      post: generated.content,
      model: modelId,
      tokensUsed: generated.tokensUsed,
    });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

// POST /api/tasks/ai-setup — AI generates task config from natural language
tasksApi.post('/tasks/ai-setup', async (c) => {
  const { prompt, botId } = await c.req.json<{ prompt: string; botId?: number }>();
  if (!prompt?.trim()) return c.json({ error: 'Опишите что вы хотите.' }, 400);

  const { resolveProvider, resolveModel } = await import('../services/ai/provider.js');
  const { generateTaskConfig } = await import('../services/ai/generate.js');

  const bot = botId ? db.select().from(bots).where(eq(bots.id, botId)).limit(1).get() : null;
  const provider = resolveProvider({ botId: bot?.id, ownerId: bot?.ownerId });
  if (!provider) return c.json({ error: 'AI-провайдер не настроен. Добавьте в Настройки → AI-модели.' }, 400);

  const modelId = resolveModel(undefined, provider.id);

  try {
    const config = await generateTaskConfig({ providerId: provider.id, modelId, userPrompt: prompt });
    return c.json({ ok: true, config });
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
