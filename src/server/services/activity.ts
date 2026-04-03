import { db } from '../db/client.js';
import { activityLog } from '../db/schema.js';

export function logActivity(opts: {
  userId?: number | null;
  botId?: number | null;
  action: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}) {
  db.insert(activityLog).values({
    userId: opts.userId ?? null,
    botId: opts.botId ?? null,
    action: opts.action,
    details: opts.details ?? null,
    ipAddress: opts.ipAddress,
  }).run();
}
