import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import { db } from '../../db/client.js';
import { sources, articles } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { fetchTwitter } from './twitter.js';

const rssParser = new Parser({
  timeout: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
  },
});

export interface FetchedArticle {
  externalId: string;
  title: string;
  summary: string;
  content: string;
  url: string;
  imageUrl?: string;
  author?: string;
  publishedAt?: string;
}

/**
 * Fetch articles from an RSS source.
 */
export async function fetchRSS(url: string): Promise<FetchedArticle[]> {
  const feed = await rssParser.parseURL(url);

  const isGoogleNews = url.includes('news.google.com');

  return (feed.items ?? []).map((item) => {
    let title = item.title ?? 'Untitled';
    let author = item.creator ?? item.author;

    // Google News: title is "Заголовок - Источник", extract source name
    if (isGoogleNews && title.includes(' - ')) {
      const lastDash = title.lastIndexOf(' - ');
      author = title.slice(lastDash + 3).trim();
      title = title.slice(0, lastDash).trim();
    }

    return {
      externalId: item.guid ?? item.id ?? item.link ?? title,
      title,
      summary: item.contentSnippet ?? '',
      content: item.content ?? item.contentSnippet ?? '',
      url: item.link ?? '',
      imageUrl: item.enclosure?.url ?? extractImageFromContent(item.content ?? ''),
      author,
      publishedAt: item.isoDate ?? item.pubDate,
    };
  });
}

/**
 * Fetch from Reddit RSS (.rss endpoint).
 */
export async function fetchRedditRSS(input: string): Promise<FetchedArticle[]> {
  // Normalize: accept "r/ElectricUnicycle", "ElectricUnicycle", or full URL
  let sub = input.trim();
  if (sub.startsWith('https://') || sub.startsWith('http://')) {
    return fetchRSS(sub.endsWith('.rss') ? sub : `${sub}.rss`);
  }
  sub = sub.replace(/^r\//, '').replace(/\/$/, '');
  const url = `https://www.reddit.com/r/${sub}/hot/.rss`;
  return fetchRSS(url);
}

/**
 * Fetch articles from a web page by extracting links with headings.
 * Looks for <a> tags inside <article>, <h1>-<h4>, or common news selectors.
 */
export async function fetchWeb(url: string): Promise<FetchedArticle[]> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

  const html = await res.text();
  const $ = cheerio.load(html);
  const baseUrl = new URL(url);
  const results: FetchedArticle[] = [];
  const seen = new Set<string>();

  // Strategy: find links inside article-like containers or headings
  const selectors = [
    'article a[href]',
    'h1 a[href], h2 a[href], h3 a[href], h4 a[href]',
    '.post a[href], .entry a[href], .story a[href], .card a[href]',
    '[class*="article"] a[href], [class*="news"] a[href], [class*="post"] a[href]',
  ];

  for (const selector of selectors) {
    $(selector).each((_, el) => {
      const $el = $(el);
      const title = $el.text().trim();
      if (!title || title.length < 10 || title.length > 300) return;

      let href = $el.attr('href') ?? '';
      if (!href || href === '#' || href.startsWith('javascript:')) return;

      // Resolve relative URLs
      try {
        href = new URL(href, baseUrl).href;
      } catch { return; }

      // Skip same-page anchors, images, non-article URLs
      if (href.includes('#') && href.split('#')[0] === url) return;
      if (/\.(jpg|png|gif|svg|css|js)$/i.test(href)) return;

      if (seen.has(href)) return;
      seen.add(href);

      // Try to find summary from sibling/parent text
      const parent = $el.closest('article, .post, .entry, .story, .card, [class*="article"]');
      const summary = parent.find('p, .summary, .excerpt, .description').first().text().trim().slice(0, 500);

      // Try to find image
      const img = parent.find('img').first().attr('src') ?? parent.find('img').first().attr('data-src');
      let imageUrl: string | undefined;
      if (img) {
        try { imageUrl = new URL(img, baseUrl).href; } catch {}
      }

      results.push({
        externalId: href,
        title,
        summary: summary || title,
        content: summary || title,
        url: href,
        imageUrl,
        publishedAt: new Date().toISOString(),
      });
    });

    if (results.length >= 20) break; // Enough articles
  }

  return results.slice(0, 30);
}

/**
 * Fetch articles from a source WITHOUT storing. For testing/preview only.
 */
export async function fetchOnly(sourceId: number): Promise<FetchedArticle[]> {
  const source = db.select().from(sources).where(eq(sources.id, sourceId)).limit(1).get();
  if (!source) return [];

  switch (source.type) {
    case 'rss':
    case 'youtube':
      return fetchRSS(source.url);
    case 'reddit':
      return fetchRedditRSS(source.url);
    case 'twitter':
      return fetchTwitter(source.url);
    case 'web':
      return fetchWeb(source.url);
    default:
      return [];
  }
}

/**
 * Fetch and store new articles from a source.
 * Returns count of new articles inserted.
 */
export async function fetchAndStore(sourceId: number, maxAgeDays: number = 7): Promise<number> {
  const source = db.select().from(sources).where(eq(sources.id, sourceId)).limit(1).get();
  if (!source || !source.enabled) return 0;

  let fetched: FetchedArticle[];

  try {
    switch (source.type) {
      case 'rss':
      case 'youtube':
        fetched = await fetchRSS(source.url);
        break;
      case 'reddit':
        fetched = await fetchRedditRSS(source.url);
        break;
      case 'twitter':
        fetched = await fetchTwitter(source.url);
        break;
      case 'web':
        fetched = await fetchWeb(source.url);
        break;
      case 'telegram':
        // Telegram sources are ingested in real-time via channel_post listener
        // Manual fetch is not supported — return 0
        return 0;
      default:
        console.warn(`Unsupported source type: ${source.type}`);
        return 0;
    }
  } catch (err) {
    const errMsg = (err as Error).message;
    console.error(`Failed to fetch source "${source.name}" (${source.url}):`, errMsg);
    db.update(sources)
      .set({ lastFetchedAt: new Date().toISOString(), lastError: errMsg, lastFetchCount: 0 })
      .where(eq(sources.id, sourceId))
      .run();
    return 0;
  }

  let newCount = 0;
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;

  for (const article of fetched) {
    // Skip old articles (if no date — skip to be safe)
    if (article.publishedAt) {
      const pubDate = new Date(article.publishedAt).getTime();
      if (isNaN(pubDate) || pubDate < cutoff) continue;
    } else {
      // No date — skip unless it's a type that never has dates (like web scraping)
      if (source.type !== 'web') continue;
    }

    const existing = db.select({ id: articles.id })
      .from(articles)
      .where(eq(articles.externalId, article.externalId))
      .limit(1)
      .get();

    if (existing) continue;

    // Try to enrich from article page
    let imageUrl = article.imageUrl;
    let summary = article.summary;
    const isYouTube = article.url?.includes('youtube.com/') || article.url?.includes('youtu.be/');
    const isGoogleNews = article.url?.includes('news.google.com/');

    if (isYouTube) {
      // YouTube: get description and thumbnail
      const videoId = article.url.match(/[?&]v=([^&]+)/)?.[1] ?? article.url.match(/shorts\/([^?&]+)/)?.[1];
      if (videoId) {
        if (!imageUrl) imageUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        if (!summary || summary === article.title) {
          try {
            const res = await fetch(article.url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }, signal: AbortSignal.timeout(6000) });
            const html = await res.text();
            const descIdx = html.indexOf('"shortDescription":"');
            if (descIdx > 0) {
              const raw = html.slice(descIdx + 20, descIdx + 1000);
              const endIdx = raw.indexOf('","');
              if (endIdx > 0) summary = raw.slice(0, endIdx).replace(/\\n/g, '\n').replace(/\\"/g, '"').slice(0, 500);
            }
          } catch {}
        }
      }
    } else if (!isGoogleNews && (!imageUrl || !summary || summary === article.title) && article.url) {
      const og = await fetchOgMeta(article.url);
      if (!imageUrl && og?.image) imageUrl = og.image;
      if ((!summary || summary === article.title) && og?.description) summary = og.description;
    }

    db.insert(articles).values({
      sourceId,
      externalId: article.externalId,
      title: article.title,
      summary: summary || article.summary,
      content: article.content || summary,
      url: article.url,
      imageUrl,
      author: article.author,
      publishedAt: article.publishedAt,
    }).run();

    newCount++;
  }

  // Update status: success
  db.update(sources)
    .set({ lastFetchedAt: new Date().toISOString(), lastError: null, lastFetchCount: newCount })
    .where(eq(sources.id, sourceId))
    .run();

  return newCount;
}

/** Extract first image URL from HTML content */
function extractImageFromContent(html: string): string | undefined {
  const match = html.match(/<img[^>]+src="([^"]+)"/);
  return match?.[1];
}

/** Fetch og:image + og:description from article URL */
async function fetchOgMeta(url: string): Promise<{ image?: string; description?: string } | undefined> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      signal: AbortSignal.timeout(8000),
      redirect: 'follow',
    });
    if (!res.ok) return undefined;
    const html = await res.text();

    const getMetaContent = (property: string): string | undefined => {
      const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'))
        ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`, 'i'));
      return m?.[1];
    };

    return {
      image: getMetaContent('og:image') ?? getMetaContent('twitter:image'),
      description: getMetaContent('og:description') ?? getMetaContent('description'),
    };
  } catch {
    return undefined;
  }
}
