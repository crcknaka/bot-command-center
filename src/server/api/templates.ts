import { Hono } from 'hono';
import { db } from '../db/client.js';
import { postTemplates } from '../db/schema.js';
import { eq, or, isNull } from 'drizzle-orm';
import { requireAuth } from '../auth/middleware.js';
import { checkOwnership } from './helpers.js';

const templatesApi = new Hono();
templatesApi.use('*', requireAuth);

// GET /api/templates
templatesApi.get('/', async (c) => {
  const user = (c as any).get('user');
  const rows = user.role === 'superadmin'
    ? db.select().from(postTemplates).all()
    : db.select().from(postTemplates).where(or(eq(postTemplates.ownerId, user.id), isNull(postTemplates.ownerId))).all();
  return c.json(rows);
});

// POST /api/templates
templatesApi.post('/', async (c) => {
  const user = (c as any).get('user');
  const body = await c.req.json<{ name: string; description?: string; content: string; systemPrompt?: string; category?: string }>();
  const created = db.insert(postTemplates).values({
    ownerId: user.role === 'superadmin' ? null : user.id,
    ...body,
  }).returning().get();
  return c.json(created, 201);
});

// PATCH /api/templates/:id
templatesApi.patch('/:id', async (c) => {
  const user = (c as any).get('user');
  const id = Number(c.req.param('id'));
  const resource = db.select().from(postTemplates).where(eq(postTemplates.id, id)).limit(1).get();
  const err = checkOwnership(user, resource);
  if (err === 'not_found') return c.json({ error: 'Не найден' }, 404);
  if (err === 'forbidden') return c.json({ error: 'Нет доступа' }, 403);
  const body = await c.req.json<{ name?: string; description?: string; content?: string; systemPrompt?: string; category?: string }>();
  const updated = db.update(postTemplates).set(body).where(eq(postTemplates.id, id)).returning().get();
  return c.json(updated);
});

// DELETE /api/templates/:id
templatesApi.delete('/:id', async (c) => {
  const user = (c as any).get('user');
  const id = Number(c.req.param('id'));
  const resource = db.select().from(postTemplates).where(eq(postTemplates.id, id)).limit(1).get();
  const err = checkOwnership(user, resource);
  if (err === 'not_found') return c.json({ error: 'Не найден' }, 404);
  if (err === 'forbidden') return c.json({ error: 'Нет доступа' }, 403);
  db.delete(postTemplates).where(eq(postTemplates.id, id)).run();
  return c.json({ ok: true });
});

export { templatesApi };
