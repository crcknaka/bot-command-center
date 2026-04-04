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
  language?: string; // 'Russian', 'English', etc. (legacy)
  searchLang?: string; // 'ru', 'en', 'uk', 'de' — language code
  searchCountry?: string; // 'ru', 'us', 'ua', 'de' — country code (legacy single)
  searchCountries?: string[]; // ['ru', 'us'] — multiple countries
}

/** Resolve locale codes from options */
function getLocale(opts: SearchOptions): { gl: string; hl: string } {
  const gl = opts.searchCountries?.[0] ?? opts.searchCountry;
  if (opts.searchLang || gl) {
    return { hl: opts.searchLang ?? 'ru', gl: gl ?? 'ru' };
  }
  // Legacy: map language name
  switch (opts.language?.toLowerCase()) {
    case 'russian': return { gl: 'ru', hl: 'ru' };
    case 'ukrainian': return { gl: 'ua', hl: 'uk' };
    case 'english': return { gl: 'us', hl: 'en' };
    case 'german': return { gl: 'de', hl: 'de' };
    default: return { gl: 'ru', hl: 'ru' };
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

/** Build query with site: operator for domain filtering (Serper, SerpAPI, Google CSE, Brave) */
function buildQueryWithDomains(query: string, domains?: string[]): string {
  if (!domains?.length) return query;
  if (domains.length === 1) return `site:${domains[0]} ${query}`;
  // Multiple domains: (site:a.com OR site:b.com) query
  return `(${domains.map(d => `site:${d}`).join(' OR ')}) ${query}`;
}

// ─── Search Implementations ─────────────────────────────────────────────────

async function searchTavily(apiKey: string, opts: SearchOptions): Promise<SearchResult[]> {
  const client = tavily({ apiKey });
  // Tavily doesn't support gl/hl, so we hint language in the query itself
  const locale = getLocale(opts);
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
  const locale = getLocale(opts);
  const params: any = {
    q: buildQueryWithDomains(opts.query, opts.includeDomains),
    num: opts.maxResults ?? 5,
    gl: locale.gl,
    hl: locale.hl,
  };
  if (opts.timeRange) {
    const tbs: Record<string, string> = { day: 'qdr:d', week: 'qdr:w', month: 'qdr:m', year: 'qdr:y' };
    params.tbs = tbs[opts.timeRange];
  }

  // Fetch search results and images in parallel
  const headers = { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' };
  const [searchRes, imagesRes] = await Promise.all([
    fetch('https://google.serper.dev/search', { method: 'POST', headers, body: JSON.stringify(params) }),
    fetch('https://google.serper.dev/images', { method: 'POST', headers, body: JSON.stringify({ q: opts.query, num: opts.maxResults ?? 5, gl: locale.gl, hl: locale.hl }) }).catch(() => null),
  ]);
  const data = await safeFetchJson(searchRes, 'Serper API');
  const imagesData = imagesRes ? await safeFetchJson(imagesRes, 'Serper Images').catch(() => null) : null;

  // Build image lookup: map domain → first image URL
  const imagesByDomain: Record<string, string> = {};
  const imagesList: string[] = [];
  if (imagesData?.images) {
    for (const img of imagesData.images) {
      if (img.imageUrl) {
        imagesList.push(img.imageUrl);
        try {
          const domain = new URL(img.link ?? '').hostname;
          if (!imagesByDomain[domain]) imagesByDomain[domain] = img.imageUrl;
        } catch {}
      }
    }
  }

  return (data.organic ?? []).map((r: any, i: number) => {
    // Try: result's own image → image from same domain → i-th image from image search
    let imageUrl = r.imageUrl;
    if (!imageUrl) {
      try { imageUrl = imagesByDomain[new URL(r.link).hostname]; } catch {}
    }
    if (!imageUrl && imagesList[i]) imageUrl = imagesList[i];
    return {
      title: r.title ?? '',
      url: r.link ?? '',
      content: r.snippet ?? '',
      score: 1 - i * 0.1,
      imageUrl,
    };
  });
}

async function searchSerpApi(apiKey: string, opts: SearchOptions): Promise<SearchResult[]> {
  const locale = getLocale(opts);
  const params = new URLSearchParams({
    q: buildQueryWithDomains(opts.query, opts.includeDomains),
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
  const locale = getLocale(opts);
  const params = new URLSearchParams({
    q: buildQueryWithDomains(opts.query, opts.includeDomains),
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
  const locale = getLocale(opts);
  const cseId = baseUrl ?? '';
  const params = new URLSearchParams({
    q: buildQueryWithDomains(opts.query, opts.includeDomains),
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
  const countries = opts.searchCountries?.length ? opts.searchCountries : undefined;

  // If multiple countries, search each and merge (deduplicate by URL)
  if (countries && countries.length > 1) {
    const perCountry = Math.max(1, Math.ceil((opts.maxResults ?? 5) / countries.length));
    const allResults: SearchResult[] = [];
    const seenUrls = new Set<string>();

    for (const country of countries) {
      const countryOpts = { ...opts, searchCountries: [country], maxResults: perCountry };
      try {
        const results = await searchWebSingle(provider, countryOpts);
        for (const r of results) {
          if (!seenUrls.has(r.url)) { seenUrls.add(r.url); allResults.push(r); }
        }
      } catch {}
    }
    return allResults.slice(0, opts.maxResults ?? 5);
  }

  return searchWebSingle(provider, opts);
}

async function searchWebSingle(provider: ResolvedProvider, opts: SearchOptions): Promise<SearchResult[]> {
  switch (provider.type) {
    case 'tavily': return searchTavily(provider.apiKey, opts);
    case 'serper': return searchSerper(provider.apiKey, opts);
    case 'serpapi': return searchSerpApi(provider.apiKey, opts);
    case 'brave': return searchBrave(provider.apiKey, opts);
    case 'google_cse': return searchGoogleCSE(provider.apiKey, opts, provider.baseUrl);
    default: throw new Error(`Неизвестный тип поискового провайдера: ${provider.type}`);
  }
}
