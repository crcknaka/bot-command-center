import { Hono } from 'hono';
import { db } from '../db/client.js';
import { tasks, sources, channels, bots } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../auth/middleware.js';
import { getTaskModule, getAvailableTaskTypes } from '../tasks/registry.js';
import { fetchAndStore } from '../tasks/news-feed/fetcher.js';
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

// POST /api/sources/:id/fetch — manually fetch this source
tasksApi.post('/sources/:id/fetch', async (c) => {
  const id = Number(c.req.param('id'));
  try {
    const count = await fetchAndStore(id);
    return c.json({ ok: true, newArticles: count });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

export { tasksApi };
