import { db } from '../db/client.js';
import { posts, channels, bots } from '../db/schema.js';
import { eq, and, lte, desc } from 'drizzle-orm';
import { botManager } from '../bot/manager.js';
import { scheduler } from './scheduler.js';

/**
 * Publish all queued posts whose scheduledFor <= now.
 * Called by a cron job every minute.
 */
async function publishPendingPosts() {
  const now = new Date().toISOString();

  // Get all queued posts that are ready to publish
  const pendingPosts = db.select().from(posts)
    .where(and(
      eq(posts.status, 'queued'),
      lte(posts.scheduledFor, now),
    ))
    .all();

  // Also get queued posts with no scheduled time (publish immediately)
  const immediatesPosts = db.select().from(posts)
    .where(eq(posts.status, 'queued'))
    .all()
    .filter((p) => !p.scheduledFor);

  const allReady = [...pendingPosts, ...immediatesPosts];
  // Deduplicate by id
  const unique = [...new Map(allReady.map((p) => [p.id, p])).values()];

  for (const post of unique) {
    const channel = db.select().from(channels).where(eq(channels.id, post.channelId)).limit(1).get();
    if (!channel) {
      db.update(posts).set({ status: 'failed', errorMessage: 'Channel not found' }).where(eq(posts.id, post.id)).run();
      continue;
    }

    const botInstance = botManager.getBotInstance(channel.botId);
    if (!botInstance) {
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
      if (elapsed < minInterval) continue; // Too soon, wait
    }

    // Mark as publishing
    db.update(posts).set({ status: 'publishing' }).where(eq(posts.id, post.id)).run();

    try {
      // Build content with signature
      let content = post.content;
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

      db.update(posts).set({
        status: 'published',
        publishedAt: new Date().toISOString(),
        telegramMessageId: messageId,
        updatedAt: new Date().toISOString(),
      }).where(eq(posts.id, post.id)).run();

      // Auto-pin
      if (bot?.autoPin) {
        try { await botInstance.api.pinChatMessage(channel.chatId, messageId); } catch {}
      }

      // Auto-delete after N hours
      if (bot?.autoDeleteHours && bot.autoDeleteHours > 0) {
        setTimeout(async () => {
          try { await botInstance.api.deleteMessage(channel.chatId, messageId); } catch {}
        }, bot.autoDeleteHours * 3600 * 1000);
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
