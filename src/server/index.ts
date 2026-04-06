import { env } from './env.js';
import { runMigrations } from './db/migrate.js';
import { ensureSuperadmin } from './auth/index.js';
import { botManager } from './bot/manager.js';
import { startPublisher } from './services/publisher.js';
import { api } from './api/index.js';
import { serve } from '@hono/node-server';
import { scheduler } from './services/scheduler.js';
import { db } from './db/client.js';
import { sessions, messageStats, posts } from './db/schema.js';
import { lt, eq } from 'drizzle-orm';

async function main() {
  console.log('🚀 Bot Command Center starting...');

  // 1. Run database migrations
  runMigrations();

  // 1b. Migrate: approved → draft (status removed)
  const migratedApproved = db.update(posts).set({ status: 'draft' }).where(eq(posts.status, 'approved' as any)).run();
  if (migratedApproved.changes > 0) console.log(`📦 Migrated ${migratedApproved.changes} approved post(s) �� draft`);

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
    const deleted = db.delete(messageStats).where(lt(messageStats.createdAt, cutoff.toISOString())).run();
    if (deleted.changes > 0) console.log(`🧹 Cleaned ${deleted.changes} old message stats`);
  });

  // 7. Start HTTP server
  const server = serve({
    fetch: api.fetch,
    port: env.PORT,
  }, (info) => {
    console.log(`🌐 API server running at http://localhost:${info.port}`);
    console.log(`   Health: http://localhost:${info.port}/api/health`);
    console.log(`\n📋 Default login: admin@localhost / admin`);
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
