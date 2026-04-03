import { Hono } from 'hono';
import { db } from '../db/client.js';
import { tasks, sources, channels } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../auth/middleware.js';
import { getTaskModule, getAvailableTaskTypes } from '../tasks/registry.js';
import { fetchAndStore } from '../tasks/news-feed/fetcher.js';

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

  const created = db.insert(tasks).values({
    channelId,
    name: body.name ?? null,
    type: body.type as any,
    config: body.config ?? {},
    schedule: body.schedule,
    enabled: body.enabled ?? true,
  }).returning().get();

  return c.json(created, 201);
});

// PATCH /api/tasks/:id
tasksApi.patch('/tasks/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json<{
    config?: Record<string, unknown>;
    schedule?: string;
    enabled?: boolean;
  }>();

  const updated = db.update(tasks).set(body as any).where(eq(tasks.id, id)).returning().get();
  if (!updated) return c.json({ error: 'Not found' }, 404);

  return c.json(updated);
});

// DELETE /api/tasks/:id
tasksApi.delete('/tasks/:id', async (c) => {
  const id = Number(c.req.param('id'));
  db.delete(tasks).where(eq(tasks.id, id)).run();
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
  const id = Number(c.req.param('id'));
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
