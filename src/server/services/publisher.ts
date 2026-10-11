import { db } from '../db/client.js';
import { posts, channels, bots } from '../db/schema.js';
import { eq, and, lte, or, isNull, desc } from 'drizzle-orm';
import { botManager } from '../bot/manager.js';
import { scheduler } from './scheduler.js';
import { sendClaimedPost } from './publish.js';

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

  const requeue = (id: number) => db.update(posts).set({ status: 'queued' }).where(eq(posts.id, id)).run();

  for (const post of ready) {
    const channel = db.select().from(channels).where(eq(channels.id, post.channelId)).limit(1).get();
    if (!channel) {
      db.update(posts).set({ status: 'failed', errorMessage: 'Channel not found' }).where(eq(posts.id, post.id)).run();
      continue;
    }

    const bot = db.select().from(bots).where(eq(bots.id, channel.botId)).limit(1).get();

    if (!botManager.getBotInstance(channel.botId)) {
      if (bot?.status === 'active' || botManager.isStarting(channel.botId)) {
        // The bot is mid-restart (task or rule change) — try again next minute
        requeue(post.id);
      } else {
        db.update(posts).set({ status: 'failed', errorMessage: 'Бот остановлен', updatedAt: new Date().toISOString() }).where(eq(posts.id, post.id)).run();
      }
      continue;
    }

    // Check min interval between posts
    const minInterval = bot?.minPostIntervalMinutes ?? 60;
    const lastPublished = db.select().from(posts)
      .where(and(eq(posts.channelId, post.channelId), eq(posts.status, 'published')))
      .orderBy(desc(posts.publishedAt)).limit(1).get();

    if (lastPublished?.publishedAt) {
      const elapsed = (Date.now() - new Date(lastPublished.publishedAt).getTime()) / 60000;
      if (elapsed < minInterval) {
        // Too soon — reset to queued so it's retried next cycle
        requeue(post.id);
        continue;
      }
    }

    // Failures are recorded on the post by sendClaimedPost
    await sendClaimedPost(post).catch(() => {});
  }
}

/**
 * Posts left in 'publishing' by a restart: the send may or may not have reached Telegram,
 * so they are not retried automatically — a duplicate in the channel is worse than a manual check.
 */
export function recoverInterruptedPosts() {
  const stuck = db.update(posts)
    .set({
      status: 'failed',
      errorMessage: 'Сервер перезапустился во время отправки. Проверьте канал: пост мог уже выйти.',
      updatedAt: new Date().toISOString(),
    })
    .where(eq(posts.status, 'publishing'))
    .run();
  if (stuck.changes > 0) console.log(`⚠️  ${stuck.changes} post(s) were interrupted mid-publish and marked as failed`);
}

/**
 * Start the publisher cron job (runs every minute).
 */
export function startPublisher() {
  scheduler.register('publisher', '* * * * *', publishPendingPosts);
  console.log('📬 Publisher started (checks every minute)');
}
