import { db } from '../db/client.js';
import { posts, channels } from '../db/schema.js';
import { eq, and, lte } from 'drizzle-orm';
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
      // Bot not running, skip for now (will retry next tick)
      continue;
    }

    // Mark as publishing
    db.update(posts).set({ status: 'publishing' }).where(eq(posts.id, post.id)).run();

    try {
      let messageId: number;

      if (post.imageUrl) {
        const msg = await botInstance.api.sendPhoto(channel.chatId, post.imageUrl, {
          caption: post.content,
          parse_mode: 'HTML',
        });
        messageId = msg.message_id;
      } else {
        const msg = await botInstance.api.sendMessage(channel.chatId, post.content, {
          parse_mode: 'HTML',
        });
        messageId = msg.message_id;
      }

      db.update(posts).set({
        status: 'published',
        publishedAt: new Date().toISOString(),
        telegramMessageId: messageId,
        updatedAt: new Date().toISOString(),
      }).where(eq(posts.id, post.id)).run();

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
