import { Hono } from 'hono';
import { db } from '../db/client.js';
import { aiProviders } from '../db/schema.js';
import { eq, and, or, isNull } from 'drizzle-orm';
import { requireAuth } from '../auth/middleware.js';
import { generatePost, generatePostFromSearch } from '../services/ai/generate.js';
import { searchWeb } from '../services/search.js';

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
    isDefault?: boolean;
  }>();

  const created = db.insert(aiProviders).values({
    ownerId: user.role === 'superadmin' && body.isDefault ? null : user.id,
    name: body.name,
    type: body.type as any,
    authType: 'api_key',
    apiKey: body.apiKey,
    baseUrl: body.baseUrl,
    isDefault: body.isDefault ?? false,
  }).returning().get();

  return c.json({ ...created, apiKey: created.apiKey ? '••••' + created.apiKey.slice(-4) : null }, 201);
});

// DELETE /api/ai-providers/:id
aiProvidersApi.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  db.delete(aiProviders).where(eq(aiProviders.id, id)).run();
  return c.json({ ok: true });
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
        modelId: body.modelId,
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
        modelId: body.modelId,
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
