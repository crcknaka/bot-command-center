import { env } from './env.js';
import { runMigrations } from './db/migrate.js';
import { ensureSuperadmin } from './auth/index.js';
import { botManager } from './bot/manager.js';
import { startPublisher, recoverInterruptedPosts } from './services/publisher.js';
import { api } from './api/index.js';
import { serve } from '@hono/node-server';
import { scheduler } from './services/scheduler.js';
import { db } from './db/client.js';
import { sessions, messageStats, posts, articles, tasks, settings } from './db/schema.js';
import { lt, eq, and, isNull, isNotNull, inArray } from 'drizzle-orm';
import { sqlTime } from './db/time.js';
import { reopenExpiredTopics } from './services/topics.js';
import { backupDatabase } from './services/backup.js';

async function main() {
  console.log('🚀 Bot Command Center starting...');

  // 1. Run database migrations
  runMigrations();

  // 1b. Migrate: approved → draft (status removed)
  const migratedApproved = db.update(posts).set({ status: 'draft' }).where(eq(posts.status, 'approved' as any)).run();
  if (migratedApproved.changes > 0) console.log(`📦 Migrated ${migratedApproved.changes} approved post(s) �� draft`);

  // 1b'. Articles that already have a post count as processed (older versions did not record it)
  const withPosts = db.select({ id: posts.articleId }).from(posts).where(isNotNull(posts.articleId)).all().map((p) => p.id!);
  if (withPosts.length > 0) {
    db.update(articles).set({ processedAt: new Date().toISOString() })
      .where(and(isNull(articles.processedAt), inArray(articles.id, withPosts))).run();
  }

  // 1b''. Moderation never started in production builds before this version (its handlers
  // crashed on load), so rules saved back then have never been enforced. Switch those tasks
  // off once, so an upgrade does not begin deleting messages on its own; they are switched
  // back on from the panel.
  const MODERATION_MIGRATION_KEY = 'migration.moderationDormant';
  if (!db.select().from(settings).where(eq(settings.key, MODERATION_MIGRATION_KEY)).limit(1).get()) {
    const paused = db.update(tasks).set({ enabled: false }).where(and(eq(tasks.type, 'moderation'), eq(tasks.enabled, true))).run();
    db.insert(settings).values({ key: MODERATION_MIGRATION_KEY, value: String(paused.changes) }).run();
    if (paused.changes > 0) console.log(`🛡️  ${paused.changes} moderation task(s) switched off after the upgrade — review the rules and switch them on in the panel`);
  }

  // 1c. Posts caught mid-send by the previous shutdown
  recoverInterruptedPosts();

  // 2. Create default superadmin if none exists
  await ensureSuperadmin();

  // 3. Start all active bots
  await botManager.startAll();
  console.log(`🤖 ${botManager.runningCount} bot(s) running`);

  // 4. Start publisher (checks queued posts every minute)
  startPublisher();

  // 5. Session cleanup (every hour)
  scheduler.register('session-cleanup', '0 * * * *', async () => {
    const now = new Date().toISOString();
    const deleted = db.delete(sessions).where(lt(sessions.expiresAt, now)).run();
    if (deleted.changes > 0) console.log(`🧹 Cleaned ${deleted.changes} expired session(s)`);
  });

  // 6. Message stats cleanup (daily at 3 AM — delete older than 90 days)
  scheduler.register('stats-cleanup', '0 3 * * *', async () => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const deleted = db.delete(messageStats).where(lt(messageStats.createdAt, sqlTime(cutoff))).run();
    if (deleted.changes > 0) console.log(`🧹 Cleaned ${deleted.changes} old message stats`);
  });

  // 6b. Message text previews are personal data: keep them two weeks, the counters stay for 90 days
  scheduler.register('preview-cleanup', '30 3 * * *', async () => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 14);
    const wiped = db.update(messageStats).set({ textPreview: null })
      .where(and(lt(messageStats.createdAt, sqlTime(cutoff)), isNotNull(messageStats.textPreview))).run();
    if (wiped.changes > 0) console.log(`🧹 Wiped ${wiped.changes} old message preview(s)`);
  });

  // 6c. Topics closed for a limited time
  scheduler.register('topic-reopen', '* * * * *', reopenExpiredTopics);

  // 6d. Nightly database backup into data/backups (last 7 kept)
  scheduler.register('db-backup', '0 4 * * *', backupDatabase);

  // 7. Start HTTP server
  const server = serve({
    fetch: api.fetch,
    port: env.PORT,
  }, (info) => {
    console.log(`🌐 API server running at http://localhost:${info.port}`);
    console.log(`   Health: http://localhost:${info.port}/api/health`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n🔴 Shutting down...');
    await botManager.shutdownAll();
    server.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
