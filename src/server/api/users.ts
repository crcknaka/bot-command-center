import { Hono } from 'hono';
import { db } from '../db/client.js';
import { users, bots } from '../db/schema.js';
import { eq, count } from 'drizzle-orm';
import { requireAuth, requireSuperadmin } from '../auth/middleware.js';

const usersApi = new Hono();
usersApi.use('*', requireAuth);
usersApi.use('*', requireSuperadmin);

// GET /api/users
usersApi.get('/', async (c) => {
  const rows = db.select().from(users).all();
  const enriched = rows.map((u) => {
    const botCount = db.select({ value: count() }).from(bots).where(eq(bots.ownerId, u.id)).get()!.value;
    return { ...u, passwordHash: undefined, botCount };
  });
  return c.json(enriched);
});

// PATCH /api/users/:id — toggle active, change role
usersApi.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json<{ isActive?: boolean; role?: string; name?: string }>();
  const updated = db.update(users).set(body as any).where(eq(users.id, id)).returning().get();
  if (!updated) return c.json({ error: 'Не найден' }, 404);
  return c.json({ ...updated, passwordHash: undefined });
});

// DELETE /api/users/:id
usersApi.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const me = (c as any).get('user');
  if (me.id === id) return c.json({ error: 'Нельзя удалить себя' }, 400);
  db.delete(users).where(eq(users.id, id)).run();
  return c.json({ ok: true });
});

export { usersApi };
