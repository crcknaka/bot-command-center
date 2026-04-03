import type { FetchedArticle } from './fetcher.js';

/**
 * RSS bridge services that convert Twitter/X to RSS.
 * We try multiple — if one is down, the next picks up.
 */
const RSS_BRIDGES = [
  (user: string) => `https://rsshub.app/twitter/user/${user}`,
  (user: string) => `https://nitter.privacydev.net/${user}/rss`,
  (user: string) => `https://nitter.poast.org/${user}/rss`,
  (user: string) => `https://twiiit.com/${user}/rss`,
];

/**
 * Normalize Twitter input: accept @username, username, or full URL.
 */
function extractUsername(input: string): string {
  let s = input.trim();
  // Full URL: https://x.com/username or https://twitter.com/username
  const urlMatch = s.match(/(?:twitter\.com|x\.com)\/(@?[\w]+)/i);
  if (urlMatch) return urlMatch[1].replace(/^@/, '');
  // @username or username
  return s.replace(/^@/, '').replace(/\/$/, '');
}

/**
 * Fetch tweets from a Twitter/X account via RSS bridges.
 */
export async function fetchTwitter(input: string): Promise<FetchedArticle[]> {
  const username = extractUsername(input);
  if (!username) throw new Error('Не удалось определить имя пользователя Twitter/X');

  const errors: string[] = [];

  // Dynamic import rss-parser (same instance config as fetcher.ts)
  const { default: Parser } = await import('rss-parser');
  const parser = new Parser({
    timeout: 10000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  for (const buildUrl of RSS_BRIDGES) {
    const url = buildUrl(username);
    try {
      const feed = await parser.parseURL(url);
      if (!feed.items?.length) continue;

      return feed.items.map((item) => ({
        externalId: item.guid ?? item.id ?? item.link ?? '',
        title: item.title ?? `Tweet от @${username}`,
        summary: item.contentSnippet ?? '',
        content: item.content ?? item.contentSnippet ?? '',
        url: item.link ?? `https://x.com/${username}`,
        imageUrl: extractImageFromHtml(item.content ?? ''),
        author: username,
        publishedAt: item.isoDate,
      }));
    } catch (err) {
      errors.push(`${url}: ${(err as Error).message}`);
    }
  }

  throw new Error(
    `Не удалось загрузить Twitter/X @${username}. Все RSS-мосты недоступны.\n` +
    `Попробуйте позже или используйте Tavily поиск с запросом "from:@${username} site:x.com".\n` +
    `Подробности: ${errors.join('; ')}`
  );
}

function extractImageFromHtml(html: string): string | undefined {
  const match = html.match(/<img[^>]+src="([^"]+)"/);
  return match?.[1];
}
