import { Hono } from 'hono';
import { db } from '../db/client.js';
import { searchProviders } from '../db/schema.js';
import { eq, or, isNull } from 'drizzle-orm';
import { requireAuth } from '../auth/middleware.js';
import { searchWeb } from '../services/search.js';
import { checkOwnership } from './helpers.js';

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
  const user = (c as any).get('user');
  const id = Number(c.req.param('id'));
  const resource = db.select().from(searchProviders).where(eq(searchProviders.id, id)).limit(1).get();
  const err = checkOwnership(user, resource);
  if (err === 'not_found') return c.json({ error: 'Не найден' }, 404);
  if (err === 'forbidden') return c.json({ error: 'Нет доступа' }, 403);
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

async function testSearchProvider(provider: any) {
  switch (provider.type) {
    case 'tavily': {
      const { tavily } = await import('@tavily/core');
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
    case 'serpapi': {
      const res = await fetch(`https://serpapi.com/search?q=test&api_key=${provider.apiKey}&engine=google&num=1`);
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      const data = await res.json() as any;
      return (data.organic_results ?? []).map((r: any) => ({ title: r.title }));
    }
    case 'google_cse': {
      const cseId = provider.baseUrl ?? '';
      const res = await fetch(`https://www.googleapis.com/customsearch/v1?q=test&key=${provider.apiKey}&cx=${cseId}&num=1`);
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      const data = await res.json() as any;
      return (data.items ?? []).map((r: any) => ({ title: r.title }));
    }
    default:
      throw new Error(`Тест не реализован для типа: ${provider.type}`);
  }
}

export { searchProvidersApi };
