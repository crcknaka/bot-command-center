import { db } from '../../db/client.js';
import { articles } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import type { FetchedArticle } from './fetcher.js';
import { Bot } from 'grammy';

/**
 * Fetch recent posts from a Telegram channel using getHistory via bot API.
 * The bot must be a member/admin of the source channel.
 *
 * URL format: @channel_username or numeric chat ID
 */
export async function fetchTelegramChannel(chatId: string, botToken: string): Promise<FetchedArticle[]> {
  const bot = new Bot(botToken);
  const results: FetchedArticle[] = [];

  try {
    // Get channel info
    const chat = await bot.api.getChat(chatId);
    const channelTitle = 'title' in chat ? chat.title : chatId;

    // Unfortunately, Telegram Bot API doesn't have getHistory.
    // Bots can only receive updates via polling/webhook.
    // For channel reading, we use a workaround: forwardMessage from channel.
    // But this requires the channel to have recent messages.
    //
    // Better approach: use bot.api.getUpdates or track channel_post updates.
    // For MVP: we store channel posts as they come in via bot polling (real-time).
    // This fetcher just checks if we already have articles from this source.

    // Return empty — real ingestion happens via BotManager's channel_post handler
    return [];
  } catch (err) {
    throw new Error(`Не удалось подключиться к каналу ${chatId}: ${(err as Error).message}`);
  }
}

/**
 * Register a channel_post listener on the bot to capture posts from source channels.
 * Called during BotManager.startBot() for telegram-type sources.
 */
export function registerTelegramSourceListener(
  bot: Bot,
  sourceId: number,
  sourceChatId: string,
) {
  bot.on('channel_post', (ctx) => {
    const post = ctx.channelPost;
    // Only capture from the source channel
    const postChatId = post.chat.id.toString();
    const normalizedSource = sourceChatId.replace('@', '');
    const matchesUsername = post.chat.username && post.chat.username === normalizedSource;
    const matchesId = postChatId === sourceChatId;

    if (!matchesUsername && !matchesId) return;

    const text = post.text ?? post.caption ?? '';
    if (!text) return; // skip media-only posts

    const externalId = `tg-${post.chat.id}-${post.message_id}`;

    // Check for duplicate
    const existing = db.select({ id: articles.id }).from(articles)
      .where(eq(articles.externalId, externalId)).limit(1).get();
    if (existing) return;

    // Store as article
    db.insert(articles).values({
      sourceId,
      externalId,
      title: text.slice(0, 100) + (text.length > 100 ? '...' : ''),
      content: text,
      summary: text.slice(0, 300),
      url: post.chat.username ? `https://t.me/${post.chat.username}/${post.message_id}` : '',
      author: post.chat.title ?? 'Telegram',
      publishedAt: new Date(post.date * 1000).toISOString(),
    }).run();

    console.log(`📩 Captured post from TG channel ${post.chat.title ?? sourceChatId}`);
  });
}
