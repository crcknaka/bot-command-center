import { Hono } from 'hono';
import { db } from '../db/client.js';
import { aiProviders } from '../db/schema.js';
import { eq, and, or, isNull } from 'drizzle-orm';
import { requireAuth } from '../auth/middleware.js';
import { checkOwnership } from './helpers.js';
import { generatePost, generatePostFromSearch } from '../services/ai/generate.js';
import { searchWeb } from '../services/search.js';
import { resolveModel } from '../services/ai/provider.js';

const aiProvidersApi = new Hono();
aiProvidersApi.use('*', requireAuth);

// GET /api/ai-providers — list providers (own + global)
aiProvidersApi.get('/', async (c) => {
  const user = (c as any).get('user');

  const rows = user.role === 'superadmin'
    ? db.select().from(aiProviders).all()
    : db.select().from(aiProviders)
        .where(or(eq(aiProviders.ownerId, user.id), isNull(aiProviders.ownerId)))
        .all();

  // Mask API keys
  const masked = rows.map((p) => ({
    ...p,
    apiKey: p.apiKey ? '••••' + p.apiKey.slice(-4) : null,
    oauthToken: p.oauthToken ? '••••' : null,
    oauthRefreshToken: undefined,
  }));

  return c.json(masked);
});

// POST /api/ai-providers — add provider
aiProvidersApi.post('/', async (c) => {
  const user = (c as any).get('user');
  const body = await c.req.json<{
    name: string;
    type: string;
    apiKey?: string;
    baseUrl?: string;
    modelId?: string;
    isDefault?: boolean;
  }>();

  const created = db.insert(aiProviders).values({
    ownerId: user.role === 'superadmin' && body.isDefault ? null : user.id,
    name: body.name,
    type: body.type as any,
    authType: 'api_key',
    apiKey: body.apiKey,
    baseUrl: body.baseUrl,
    modelId: body.modelId ?? null,
    isDefault: body.isDefault ?? false,
  }).returning().get();

  return c.json({ ...created, apiKey: created.apiKey ? '••••' + created.apiKey.slice(-4) : null }, 201);
});

// PATCH /api/ai-providers/:id — update provider (model, name, etc.)
aiProvidersApi.patch('/:id', async (c) => {
  const user = (c as any).get('user');
  const id = Number(c.req.param('id'));
  const resource = db.select().from(aiProviders).where(eq(aiProviders.id, id)).limit(1).get();
  const err = checkOwnership(user, resource);
  if (err === 'not_found') return c.json({ error: 'Не найден' }, 404);
  if (err === 'forbidden') return c.json({ error: 'Нет доступа' }, 403);

  const body = await c.req.json<{ modelId?: string | null; name?: string; isDefault?: boolean }>();
  const updated = db.update(aiProviders).set(body as any).where(eq(aiProviders.id, id)).returning().get();
  return c.json({ ...updated, apiKey: updated.apiKey ? '••••' + updated.apiKey.slice(-4) : null });
});

// DELETE /api/ai-providers/:id
aiProvidersApi.delete('/:id', async (c) => {
  const user = (c as any).get('user');
  const id = Number(c.req.param('id'));
  const resource = db.select().from(aiProviders).where(eq(aiProviders.id, id)).limit(1).get();
  const err = checkOwnership(user, resource);
  if (err === 'not_found') return c.json({ error: 'Не найден' }, 404);
  if (err === 'forbidden') return c.json({ error: 'Нет доступа' }, 403);
  db.delete(aiProviders).where(eq(aiProviders.id, id)).run();
  return c.json({ ok: true });
});

// GET /api/ai-providers/:id/models — list available models
aiProvidersApi.get('/:id/models', async (c) => {
  const id = Number(c.req.param('id'));
  const provider = db.select().from(aiProviders).where(eq(aiProviders.id, id)).limit(1).get();
  if (!provider) return c.json({ error: 'Не найден' }, 404);

  try {
    const apiKey = provider.apiKey || '';
    const baseURL = provider.baseUrl || undefined;
    let models: string[] = [];

    switch (provider.type) {
      case 'openai':
      case 'custom': {
        const res = await fetch(`${baseURL || 'https://api.openai.com'}/v1/models`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok) {
          const data = await res.json() as any;
          models = (data.data ?? []).map((m: any) => m.id).sort();
        }
        break;
      }
      case 'anthropic': {
        // Anthropic doesn't have a models list API — hardcode known models
        models = ['claude-sonnet-4-20250514', 'claude-haiku-4-20250414', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'];
        break;
      }
      case 'google': {
        models = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'];
        break;
      }
      case 'openrouter': {
        const res = await fetch('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(10000) });
        if (res.ok) {
          const data = await res.json() as any;
          models = (data.data ?? []).map((m: any) => m.id).sort().slice(0, 50);
        }
        break;
      }
      case 'ollama': {
        const base = baseURL || 'http://localhost:11434';
        const res = await fetch(`${base.replace('/v1', '')}/api/tags`, { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          const data = await res.json() as any;
          models = (data.models ?? []).map((m: any) => m.name);
        }
        break;
      }
      case 'lmstudio': {
        const base = baseURL || 'http://localhost:1234';
        const res = await fetch(`${base}/v1/models`, { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          const data = await res.json() as any;
          models = (data.data ?? []).map((m: any) => m.id);
        }
        break;
      }
    }

    return c.json({ models, current: provider.modelId });
  } catch (err) {
    return c.json({ error: (err as Error).message, models: [] });
  }
});

// POST /api/ai-providers/:id/test — test provider connection
aiProvidersApi.post('/:id/test', async (c) => {
  const id = Number(c.req.param('id'));
  const { modelId } = await c.req.json<{ modelId: string }>();

  try {
    const result = await generatePost({
      providerId: id,
      modelId,
      systemPrompt: 'You are a helpful assistant.',
      userPrompt: 'Say "Hello from Bot Command Center!" in one sentence.',
      maxTokens: 50,
    });
    return c.json({ ok: true, response: result.content, tokensUsed: result.tokensUsed });
  } catch (err) {
    return c.json({ ok: false, error: (err as Error).message });
  }
});

// POST /api/generate — generate a post using AI + optional Tavily search
aiProvidersApi.post('/generate', async (c) => {
  const body = await c.req.json<{
    providerId: number;
    modelId: string;
    topic: string;
    systemPrompt?: string;
    language?: string;
    maxLength?: number;
    useSearch?: boolean;
    searchOptions?: {
      searchDepth?: 'basic' | 'advanced';
      maxResults?: number;
      timeRange?: 'day' | 'week' | 'month' | 'year';
      includeDomains?: string[];
      excludeDomains?: string[];
    };
  }>();

  const modelId = (!body.modelId || body.modelId === '__default__')
    ? resolveModel(undefined, body.providerId)
    : body.modelId;

  const systemPrompt = body.systemPrompt
    ?? 'You are a professional Telegram channel editor. Create engaging, concise posts using HTML formatting (<b>, <i>, <a href="">). Include relevant emoji sparingly.';

  try {
    if (body.useSearch) {
      // Search first, then generate
      const searchResults = await searchWeb({
        query: body.topic,
        ...body.searchOptions,
      });

      if (searchResults.length === 0) {
        return c.json({ error: 'No search results found for this topic' }, 404);
      }

      const result = await generatePostFromSearch({
        providerId: body.providerId,
        modelId,
        systemPrompt,
        searchResults,
        topic: body.topic,
        language: body.language,
        maxLength: body.maxLength,
      });

      return c.json({
        content: result.content,
        model: result.model,
        tokensUsed: result.tokensUsed,
        searchResults: searchResults.map((r) => ({ title: r.title, url: r.url, score: r.score })),
      });
    } else {
      // Generate directly without search
      const result = await generatePost({
        providerId: body.providerId,
        modelId,
        systemPrompt,
        userPrompt: `Create a Telegram post about: ${body.topic}\nLanguage: ${body.language ?? 'Russian'}\nMax length: ${body.maxLength ?? 500} characters`,
      });

      return c.json({
        content: result.content,
        model: result.model,
        tokensUsed: result.tokensUsed,
      });
    }
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

export { aiProvidersApi };
