import { tavily } from '@tavily/core';
import { db } from '../db/client.js';
import { searchProviders, bots, settings } from '../db/schema.js';
import { eq, and, isNull } from 'drizzle-orm';

export interface SearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
  imageUrl?: string;
}

export interface SearchOptions {
  query: string;
  maxResults?: number;
  timeRange?: 'day' | 'week' | 'month' | 'year';
  includeDomains?: string[];
  excludeDomains?: string[];
  botId?: number;
  language?: string; // 'Russian', 'English', 'Ukrainian' etc.
}

/** Map language name to search API locale codes */
function getLocale(lang?: string): { gl: string; hl: string } {
  switch (lang?.toLowerCase()) {
    case 'russian': return { gl: 'ru', hl: 'ru' };
    case 'ukrainian': return { gl: 'ua', hl: 'uk' };
    case 'english': return { gl: 'us', hl: 'en' };
    case 'german': return { gl: 'de', hl: 'de' };
    default: return { gl: 'ru', hl: 'ru' }; // default to Russian
  }
}

// ─── Provider Resolution ────────────────────────────────────────────────────

interface ResolvedProvider {
  id: number;
  type: string;
  apiKey: string;
  baseUrl?: string | null;
}

/**
 * Resolve search provider: bot → owner → global default → any enabled.
 */
function resolveSearchProvider(botId?: number): ResolvedProvider {
  // 1. Bot-level
  if (botId) {
    const bot = db.select().from(bots).where(eq(bots.id, botId)).limit(1).get();
    if (bot?.searchProviderId) {
      const p = db.select().from(searchProviders).where(eq(searchProviders.id, bot.searchProviderId)).limit(1).get();
      if (p?.enabled && p.apiKey) return { id: p.id, type: p.type, apiKey: p.apiKey, baseUrl: p.baseUrl };
    }
    // 2. Owner default
    if (bot) {
      const p = db.select().from(searchProviders)
        .where(and(eq(searchProviders.ownerId, bot.ownerId), eq(searchProviders.isDefault, true), eq(searchProviders.enabled, true)))
        .limit(1).get();
      if (p?.apiKey) return { id: p.id, type: p.type, apiKey: p.apiKey, baseUrl: p.baseUrl };
    }
  }

  // 3. Global default
  const globalDefault = db.select().from(searchProviders)
    .where(and(isNull(searchProviders.ownerId), eq(searchProviders.isDefault, true), eq(searchProviders.enabled, true)))
    .limit(1).get();
  if (globalDefault?.apiKey) return { id: globalDefault.id, type: globalDefault.type, apiKey: globalDefault.apiKey, baseUrl: globalDefault.baseUrl };

  // 4. Any enabled
  const any = db.select().from(searchProviders).where(eq(searchProviders.enabled, true)).limit(1).get();
  if (any?.apiKey) return { id: any.id, type: any.type, apiKey: any.apiKey, baseUrl: any.baseUrl };

  // 5. Legacy: check old global tavily key in settings
  const legacyKey = db.select().from(settings).where(eq(settings.key, 'tavily_api_key')).limit(1).get();
  if (legacyKey?.value) return { id: 0, type: 'tavily', apiKey: legacyKey.value };

  throw new Error('Поисковый провайдер не настроен. Перейдите в Настройки → Поиск и добавьте API-ключ.');
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Safely parse JSON from fetch response, with clear error if HTML is returned */
async function safeFetchJson(res: Response, providerName: string): Promise<any> {
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${providerName}: ${res.status} — ${text.slice(0, 200)}`);
  }
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('text/html')) {
    throw new Error(`${providerName}: получен HTML вместо JSON. Проверьте API-ключ.`);
  }
  try {
    return await res.json();
  } catch {
    const text = await res.text().catch(() => '');
    throw new Error(`${providerName}: невалидный JSON — ${text.slice(0, 200)}`);
  }
}

// ─── Search Implementations ─────────────────────────────────────────────────

async function searchTavily(apiKey: string, opts: SearchOptions): Promise<SearchResult[]> {
  const client = tavily({ apiKey });
  // Tavily doesn't support gl/hl, so we hint language in the query itself
  const locale = getLocale(opts.language);
  const langHints: Record<string, string> = { ru: ' на русском', uk: ' українською', de: ' auf Deutsch' };
  const queryWithLang = locale.hl !== 'en' ? opts.query + (langHints[locale.hl] ?? '') : opts.query;
  const response = await client.search(queryWithLang, {
    searchDepth: 'basic',
    maxResults: opts.maxResults ?? 5,
    topic: 'news',
    includeAnswer: false,
    includeDomains: opts.includeDomains,
    excludeDomains: opts.excludeDomains,
  });
  return response.results.map((r: any) => ({
    title: r.title ?? '',
    url: r.url ?? '',
    content: r.content ?? '',
    score: r.score ?? 0,
    imageUrl: r.images?.[0]?.url,
  }));
}

async function searchSerper(apiKey: string, opts: SearchOptions): Promise<SearchResult[]> {
  const locale = getLocale(opts.language);
  const params: any = {
    q: opts.query,
    num: opts.maxResults ?? 5,
    gl: locale.gl,
    hl: locale.hl,
  };
  if (opts.timeRange) {
    const tbs: Record<string, string> = { day: 'qdr:d', week: 'qdr:w', month: 'qdr:m', year: 'qdr:y' };
    params.tbs = tbs[opts.timeRange];
  }

  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await safeFetchJson(res, 'Serper API');

  return (data.organic ?? []).map((r: any, i: number) => ({
    title: r.title ?? '',
    url: r.link ?? '',
    content: r.snippet ?? '',
    score: 1 - i * 0.1,
    imageUrl: r.imageUrl,
  }));
}

async function searchSerpApi(apiKey: string, opts: SearchOptions): Promise<SearchResult[]> {
  const locale = getLocale(opts.language);
  const params = new URLSearchParams({
    q: opts.query,
    api_key: apiKey,
    engine: 'google',
    num: String(opts.maxResults ?? 5),
    gl: locale.gl,
    hl: locale.hl,
  });

  const res = await fetch(`https://serpapi.com/search?${params}`);
  const data = await safeFetchJson(res, 'SerpAPI');

  return (data.organic_results ?? []).map((r: any, i: number) => ({
    title: r.title ?? '',
    url: r.link ?? '',
    content: r.snippet ?? '',
    score: 1 - i * 0.1,
    imageUrl: r.thumbnail,
  }));
}

async function searchBrave(apiKey: string, opts: SearchOptions): Promise<SearchResult[]> {
  const locale = getLocale(opts.language);
  const params = new URLSearchParams({
    q: opts.query,
    count: String(opts.maxResults ?? 5),
    search_lang: locale.hl,
    country: locale.gl,
  });
  if (opts.timeRange) params.set('freshness', opts.timeRange === 'day' ? 'pd' : opts.timeRange === 'week' ? 'pw' : opts.timeRange === 'month' ? 'pm' : 'py');

  const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
    headers: { 'X-Subscription-Token': apiKey, 'Accept': 'application/json' },
  });
  const data = await safeFetchJson(res, 'Brave Search');

  return (data.web?.results ?? []).map((r: any, i: number) => ({
    title: r.title ?? '',
    url: r.url ?? '',
    content: r.description ?? '',
    score: 1 - i * 0.1,
    imageUrl: r.thumbnail?.src,
  }));
}

async function searchGoogleCSE(apiKey: string, opts: SearchOptions, baseUrl?: string | null): Promise<SearchResult[]> {
  const locale = getLocale(opts.language);
  const cseId = baseUrl ?? '';
  const params = new URLSearchParams({
    q: opts.query,
    key: apiKey,
    cx: cseId,
    num: String(Math.min(opts.maxResults ?? 5, 10)),
    gl: locale.gl,
    hl: locale.hl,
  });

  const res = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`);
  const data = await safeFetchJson(res, 'Google CSE');

  return (data.items ?? []).map((r: any, i: number) => ({
    title: r.title ?? '',
    url: r.link ?? '',
    content: r.snippet ?? '',
    score: 1 - i * 0.1,
    imageUrl: r.pagemap?.cse_image?.[0]?.src,
  }));
}

// ─── Main Search Function ───────────────────────────────────────────────────

/**
 * Search the web using the resolved provider.
 */
export async function searchWeb(opts: SearchOptions): Promise<SearchResult[]> {
  const provider = resolveSearchProvider(opts.botId);

  switch (provider.type) {
    case 'tavily': return searchTavily(provider.apiKey, opts);
    case 'serper': return searchSerper(provider.apiKey, opts);
    case 'serpapi': return searchSerpApi(provider.apiKey, opts);
    case 'brave': return searchBrave(provider.apiKey, opts);
    case 'google_cse': return searchGoogleCSE(provider.apiKey, opts, provider.baseUrl);
    default: throw new Error(`Неизвестный тип поискового провайдера: ${provider.type}`);
  }
}
