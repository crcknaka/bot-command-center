import { db } from '../db/client.js';

/** Sanitize HTML for Telegram — only allow supported tags */
function sanitizeForTelegram(html: string): string {
  let clean = html.replace(/<\/?(?!b|i|u|s|a|code|pre|\/b|\/i|\/u|\/s|\/a|\/code|\/pre)[^>]*>/gi, '');
  const allowed = ['b', 'i', 'u', 's', 'code', 'pre'];
  for (const tag of allowed) {
    const opens = (clean.match(new RegExp(`<${tag}[^>]*>`, 'gi')) || []).length;
    const closes = (clean.match(new RegExp(`</${tag}>`, 'gi')) || []).length;
    for (let i = 0; i < opens - closes; i++) clean += `</${tag}>`;
  }
  return clean;
}
import { posts, channels, bots } from '../db/schema.js';
import { eq, and, lte, or, isNull, desc } from 'drizzle-orm';
import { botManager } from '../bot/manager.js';
import { scheduler } from './scheduler.js';

/**
 * Delete posts whose deleteAt has passed.
 */
async function processAutoDeletes() {
  const now = new Date().toISOString();
  const expired = db.select().from(posts)
    .where(and(eq(posts.status, 'published'), lte(posts.deleteAt, now)))
    .all();

  for (const post of expired) {
    const channel = db.select().from(channels).where(eq(channels.id, post.channelId)).limit(1).get();
    if (!channel || !post.telegramMessageId) {
      db.update(posts).set({ deleteAt: null }).where(eq(posts.id, post.id)).run();
      continue;
    }
    const botInstance = botManager.getBotInstance(channel.botId);
    if (!botInstance) continue; // retry next cycle
    try {
      await botInstance.api.deleteMessage(channel.chatId, post.telegramMessageId);
    } catch (e) {
      console.error(`[publisher] Failed to auto-delete post #${post.id}:`, e);
    }
    db.update(posts).set({ deleteAt: null }).where(eq(posts.id, post.id)).run();
  }
}

/**
 * Publish all queued posts whose scheduledFor <= now.
 * Called by a cron job every minute.
 */
async function publishPendingPosts() {
  // Process pending auto-deletes first
  await processAutoDeletes();

  const now = new Date().toISOString();

  // Atomically claim queued posts by setting status to 'publishing'
  const ready = db.update(posts)
    .set({ status: 'publishing' })
    .where(and(
      eq(posts.status, 'queued'),
      or(lte(posts.scheduledFor, now), isNull(posts.scheduledFor)),
    ))
    .returning()
    .all();

  for (const post of ready) {
    const channel = db.select().from(channels).where(eq(channels.id, post.channelId)).limit(1).get();
    if (!channel) {
      db.update(posts).set({ status: 'failed', errorMessage: 'Channel not found' }).where(eq(posts.id, post.id)).run();
      continue;
    }

    const botInstance = botManager.getBotInstance(channel.botId);
    if (!botInstance) {
      db.update(posts).set({ status: 'failed', errorMessage: 'Bot not running', updatedAt: new Date().toISOString() }).where(eq(posts.id, post.id)).run();
      continue;
    }

    // Check min interval between posts
    const bot = db.select().from(bots).where(eq(bots.id, channel.botId)).limit(1).get();
    const minInterval = bot?.minPostIntervalMinutes ?? 60;
    const lastPublished = db.select().from(posts)
      .where(and(eq(posts.channelId, post.channelId), eq(posts.status, 'published')))
      .orderBy(desc(posts.publishedAt)).limit(1).get();

    if (lastPublished?.publishedAt) {
      const elapsed = (Date.now() - new Date(lastPublished.publishedAt).getTime()) / 60000;
      if (elapsed < minInterval) {
        // Too soon — reset to queued so it's retried next cycle
        db.update(posts).set({ status: 'queued' }).where(eq(posts.id, post.id)).run();
        continue;
      }
    }

    try {
      // Build content with signature, sanitize for Telegram
      let content = sanitizeForTelegram(post.content);
      if (bot?.postSignature) {
        content += '\n\n' + bot.postSignature;
      }

      // Build inline keyboard
      let reply_markup: any = undefined;
      const buttons = post.inlineButtons as Array<{ text: string; url: string }> | null;
      if (buttons?.length) {
        reply_markup = { inline_keyboard: [buttons.map((b) => ({ text: b.text, url: b.url }))] };
      }

      // Common send options
      const sendOpts: any = {
        parse_mode: 'HTML' as const,
        message_thread_id: channel.threadId ?? undefined,
        reply_markup,
      };

      let messageId: number;

      if (post.imageUrl) {
        const msg = await botInstance.api.sendPhoto(channel.chatId, post.imageUrl, {
          caption: content,
          ...sendOpts,
        });
        messageId = msg.message_id;
      } else {
        const msg = await botInstance.api.sendMessage(channel.chatId, content, sendOpts);
        messageId = msg.message_id;
      }

      // Calculate deleteAt if auto-delete is configured
      let deleteAt: string | null = null;
      if (bot?.autoDeleteHours && bot.autoDeleteHours > 0) {
        deleteAt = new Date(Date.now() + bot.autoDeleteHours * 3600 * 1000).toISOString();
      }

      db.update(posts).set({
        status: 'published',
        publishedAt: new Date().toISOString(),
        telegramMessageId: messageId,
        deleteAt,
        updatedAt: new Date().toISOString(),
      }).where(eq(posts.id, post.id)).run();

      // Auto-pin
      if (bot?.autoPin) {
        try { await botInstance.api.pinChatMessage(channel.chatId, messageId); } catch (e) {
          console.error(`[publisher] Failed to pin post #${post.id}:`, e);
        }
      }

      console.log(`📨 Published post #${post.id} to channel ${channel.title}`);
    } catch (err) {
      db.update(posts).set({
        status: 'failed',
        errorMessage: (err as Error).message,
        updatedAt: new Date().toISOString(),
      }).where(eq(posts.id, post.id)).run();

      console.error(`❌ Failed to publish post #${post.id}:`, (err as Error).message);
    }
  }
}

/**
 * Start the publisher cron job (runs every minute).
 */
export function startPublisher() {
  scheduler.register('publisher', '* * * * *', publishPendingPosts);
  console.log('📬 Publisher started (checks every minute)');
}
