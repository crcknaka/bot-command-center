import { db } from '../db/client.js';
import { posts, channels, bots } from '../db/schema.js';
import { eq, desc, and, or } from 'drizzle-orm';

/** Calculate next available time slot for a channel based on existing scheduled/published posts */
export function calculateNextSlot(channelId: number, intervalMinutes?: number): string {
  if (!intervalMinutes) {
    const channel = db.select().from(channels).where(eq(channels.id, channelId)).limit(1).get();
    const bot = channel ? db.select().from(bots).where(eq(bots.id, channel.botId)).limit(1).get() : null;
    intervalMinutes = bot?.minPostIntervalMinutes ?? 60;
  }

  const lastScheduled = db.select().from(posts)
    .where(and(eq(posts.channelId, channelId), or(eq(posts.status, 'queued'), eq(posts.status, 'published'))))
    .orderBy(desc(posts.scheduledFor))
    .limit(1).get();

  const now = new Date();
  let nextSlot: Date;

  if (lastScheduled?.scheduledFor) {
    const lastTime = new Date(lastScheduled.scheduledFor);
    nextSlot = new Date(lastTime.getTime() + intervalMinutes * 60000);
    if (nextSlot < now) nextSlot = new Date(now.getTime() + 60000);
  } else {
    nextSlot = new Date(now.getTime() + 60000);
  }

  return nextSlot.toISOString();
}

export type PostMode = 'queue' | 'draft' | 'publish';

type PostStatus = 'draft' | 'queued' | 'publishing' | 'published' | 'failed';

/** Resolve post status and scheduledFor based on postMode config */
export function resolvePostMode(config: { postMode?: PostMode; autoApprove?: boolean }, channelId: number, intervalMinutes?: number | null): { status: PostStatus; scheduledFor: string | null } {
  // Backward compat: autoApprove → queue
  const mode: PostMode = config.postMode ?? (config.autoApprove ? 'queue' : 'queue');

  if (mode === 'publish') {
    return { status: 'queued', scheduledFor: new Date().toISOString() };
  }
  if (mode === 'queue') {
    return { status: 'queued', scheduledFor: calculateNextSlot(channelId, intervalMinutes ?? undefined) };
  }
  return { status: 'draft', scheduledFor: null };
}
