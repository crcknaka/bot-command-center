import Parser from 'rss-parser';
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

  return (feed.items ?? []).map((item) => ({
    externalId: item.guid ?? item.id ?? item.link ?? item.title ?? '',
    title: item.title ?? 'Untitled',
    summary: item.contentSnippet ?? '',
    content: item.content ?? item.contentSnippet ?? '',
    url: item.link ?? '',
    imageUrl: item.enclosure?.url ?? extractImageFromContent(item.content ?? ''),
    author: item.creator ?? item.author,
    publishedAt: item.isoDate ?? item.pubDate,
  }));
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
 * Fetch and store new articles from a source.
 * Returns count of new articles inserted.
 */
export async function fetchAndStore(sourceId: number): Promise<number> {
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
      default:
        console.warn(`Unsupported source type: ${source.type}`);
        return 0;
    }
  } catch (err) {
    console.error(`Failed to fetch source "${source.name}" (${source.url}):`, (err as Error).message);
    return 0;
  }

  let newCount = 0;

  for (const article of fetched) {
    // Check for duplicate
    const existing = db.select({ id: articles.id })
      .from(articles)
      .where(eq(articles.externalId, article.externalId))
      .limit(1)
      .get();

    if (existing) continue;

    db.insert(articles).values({
      sourceId,
      externalId: article.externalId,
      title: article.title,
      summary: article.summary,
      content: article.content,
      url: article.url,
      imageUrl: article.imageUrl,
      author: article.author,
      publishedAt: article.publishedAt,
    }).run();

    newCount++;
  }

  // Update last fetched time
  db.update(sources)
    .set({ lastFetchedAt: new Date().toISOString() })
    .where(eq(sources.id, sourceId))
    .run();

  return newCount;
}

/** Extract first image URL from HTML content */
function extractImageFromContent(html: string): string | undefined {
  const match = html.match(/<img[^>]+src="([^"]+)"/);
  return match?.[1];
}
