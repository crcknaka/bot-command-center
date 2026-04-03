import { Hono } from 'hono';
import { db } from '../db/client.js';
import { searchProviders } from '../db/schema.js';
import { eq, or, isNull } from 'drizzle-orm';
import { requireAuth } from '../auth/middleware.js';
import { searchWeb } from '../services/search.js';

const searchProvidersApi = new Hono();
searchProvidersApi.use('*', requireAuth);

// GET /api/search-providers
searchProvidersApi.get('/', async (c) => {
  const user = (c as any).get('user');
  const rows = user.role === 'superadmin'
    ? db.select().from(searchProviders).all()
    : db.select().from(searchProviders).where(or(eq(searchProviders.ownerId, user.id), isNull(searchProviders.ownerId))).all();

  return c.json(rows.map((p) => ({
    ...p,
    apiKey: p.apiKey ? '••••' + p.apiKey.slice(-4) : null,
  })));
});

// POST /api/search-providers
searchProvidersApi.post('/', async (c) => {
  const user = (c as any).get('user');
  const body = await c.req.json<{ name: string; type: string; apiKey?: string; baseUrl?: string; isDefault?: boolean }>();

  const created = db.insert(searchProviders).values({
    ownerId: user.role === 'superadmin' && body.isDefault ? null : user.id,
    name: body.name,
    type: body.type as any,
    apiKey: body.apiKey,
    baseUrl: body.baseUrl,
    isDefault: body.isDefault ?? false,
  }).returning().get();

  return c.json({ ...created, apiKey: created.apiKey ? '••••' + created.apiKey.slice(-4) : null }, 201);
});

// DELETE /api/search-providers/:id
searchProvidersApi.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  db.delete(searchProviders).where(eq(searchProviders.id, id)).run();
  return c.json({ ok: true });
});

// POST /api/search-providers/:id/test
searchProvidersApi.post('/:id/test', async (c) => {
  const id = Number(c.req.param('id'));
  const provider = db.select().from(searchProviders).where(eq(searchProviders.id, id)).limit(1).get();
  if (!provider) return c.json({ error: 'Не найден' }, 404);

  try {
    // Override resolution — force this provider
    const results = await testSearchProvider(provider);
    return c.json({ ok: true, results: results.length, firstTitle: results[0]?.title ?? '' });
  } catch (err) {
    return c.json({ ok: false, error: (err as Error).message });
  }
});

/** Test a specific provider by doing a sample search */
async function testSearchProvider(provider: any) {
  // Temporarily create a mini search using the provider directly
  const { tavily } = await import('@tavily/core');

  switch (provider.type) {
    case 'tavily': {
      const client = tavily({ apiKey: provider.apiKey });
      const res = await client.search('test', { maxResults: 1 });
      return res.results.map((r: any) => ({ title: r.title }));
    }
    case 'serper': {
      const res = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'X-API-KEY': provider.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: 'test', num: 1 }),
      });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      const data = await res.json() as any;
      return (data.organic ?? []).map((r: any) => ({ title: r.title }));
    }
    case 'brave': {
      const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=test&count=1`, {
        headers: { 'X-Subscription-Token': provider.apiKey, 'Accept': 'application/json' },
      });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      const data = await res.json() as any;
      return (data.web?.results ?? []).map((r: any) => ({ title: r.title }));
    }
    default:
      throw new Error(`Тест не реализован для типа: ${provider.type}`);
  }
}

export { searchProvidersApi };
