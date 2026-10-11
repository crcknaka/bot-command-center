import { db } from '../db/client.js';
import { settings } from '../db/schema.js';
import { eq, like } from 'drizzle-orm';
import { botManager } from '../bot/manager.js';
import { logActivity } from './activity.js';

// Closed topics live in the settings table: topic_closed:<botId>:<chatId>:<threadId|general>
const PREFIX = 'topic_closed:';

export interface ClosedTopic {
  botId: number;
  chatId: string;
  threadId: number | null; // null = the General topic, or the whole chat when it has no topics
  until: string | null; // ISO time of the automatic reopen; null = until reopened by hand
  /** Telegram never restricts admins, so with this on the bot deletes whatever anyone posts there */
  includeAdmins: boolean;
  /** Set when a chat without topics was silenced: its permissions before, to put back on reopen */
  savedPermissions?: Record<string, unknown>;
}

const keyOf = (botId: number, chatId: string, threadId: number | null) => `${PREFIX}${botId}:${chatId}:${threadId ?? 'general'}`;

function parse(row: { key: string; value: string }): ClosedTopic | null {
  const m = row.key.slice(PREFIX.length).match(/^(\d+):(-?\d+|@\w+):(\d+|general)$/);
  if (!m) return null;
  let value: any = {};
  try { value = JSON.parse(row.value); } catch {}
  return {
    botId: Number(m[1]), chatId: m[2], threadId: m[3] === 'general' ? null : Number(m[3]),
    until: value.until ?? null, includeAdmins: !!value.includeAdmins, savedPermissions: value.savedPermissions,
  };
}

function chatRef(chatId: string): number | string {
  return /^-?\d+$/.test(chatId) ? Number(chatId) : chatId;
}

// Every message is checked against this, so it is kept in memory and mirrored to the settings table
const closed = new Map<string, ClosedTopic>();
let loaded = false;
function load() {
  if (loaded) return;
  loaded = true;
  for (const row of db.select().from(settings).where(like(settings.key, `${PREFIX}%`)).all()) {
    const topic = parse(row);
    if (topic) closed.set(row.key, topic);
  }
}

export function listClosedTopics(botId: number, chatId: string): ClosedTopic[] {
  load();
  return [...closed.values()].filter((t) => t.botId === botId && t.chatId === chatId);
}

/** Whether the bot should delete a message posted in this topic right now */
export function isSilencedForEveryone(botId: number, chatId: number, threadId: number | null): boolean {
  load();
  const topic = closed.get(keyOf(botId, String(chatId), threadId));
  return !!topic?.includeAdmins && (!topic.until || topic.until > new Date().toISOString());
}

const notModified = (err: unknown) => /TOPIC_NOT_MODIFIED|CHAT_NOT_MODIFIED/i.test((err as Error).message);
const notForum = (err: unknown) => /not a forum|forum topics|TOPIC_ID_INVALID|CHAT_NOT_FORUM/i.test((err as Error).message);

/**
 * Close a forum topic: only admins can write there until it is reopened. In a chat without
 * topics, threadId null silences the whole chat instead. The bot must be an admin with the
 * "manage topics" right (or "ban users" for a whole chat), plus "delete messages" for includeAdmins.
 * @param minutes 0 keeps it closed until reopened by hand
 */
export async function closeTopic(
  botId: number, chatId: string, threadId: number | null,
  opts: { minutes: number; includeAdmins: boolean; userId?: number },
) {
  load();
  const bot = botManager.getBotInstance(botId);
  if (!bot) throw new Error('Бот не запущен');

  const key = keyOf(botId, chatId, threadId);
  let savedPermissions = closed.get(key)?.savedPermissions;

  try {
    if (threadId === null) await bot.api.closeGeneralForumTopic(chatRef(chatId));
    else await bot.api.closeForumTopic(chatRef(chatId), threadId);
  } catch (err) {
    if (threadId === null && notForum(err)) {
      // No topics here: take away the right to write from regular members
      if (!savedPermissions) {
        const chat = await bot.api.getChat(chatRef(chatId)) as any;
        savedPermissions = chat.permissions ?? {};
      }
      try {
        await bot.api.setChatPermissions(chatRef(chatId), { can_send_messages: false });
      } catch (e) { if (!notModified(e)) throw e; }
    } else if (!notModified(err)) {
      // Closing a topic that is already closed only needs the timer updated
      throw err;
    }
  }

  const until = opts.minutes > 0 ? new Date(Date.now() + opts.minutes * 60_000).toISOString() : null;
  const topic: ClosedTopic = { botId, chatId, threadId, until, includeAdmins: opts.includeAdmins, savedPermissions };
  const value = JSON.stringify({ until, includeAdmins: opts.includeAdmins, savedPermissions });
  if (db.select().from(settings).where(eq(settings.key, key)).limit(1).get()) {
    db.update(settings).set({ value, updatedAt: new Date().toISOString() }).where(eq(settings.key, key)).run();
  } else {
    db.insert(settings).values({ key, value }).run();
  }
  closed.set(key, topic);

  logActivity({ userId: opts.userId, botId, action: 'mod.topic_closed', details: { chatId, threadId, minutes: opts.minutes, includeAdmins: opts.includeAdmins } });
  return { until };
}

export async function reopenTopic(botId: number, chatId: string, threadId: number | null, userId?: number) {
  load();
  const bot = botManager.getBotInstance(botId);
  if (!bot) throw new Error('Бот не запущен');

  const key = keyOf(botId, chatId, threadId);
  const topic = closed.get(key);

  try {
    if (topic?.savedPermissions) await bot.api.setChatPermissions(chatRef(chatId), topic.savedPermissions as any);
    else if (threadId === null) await bot.api.reopenGeneralForumTopic(chatRef(chatId));
    else await bot.api.reopenForumTopic(chatRef(chatId), threadId);
  } catch (err) {
    if (!notModified(err)) throw err;
  }

  db.delete(settings).where(eq(settings.key, key)).run();
  closed.delete(key);
  logActivity({ userId, botId, action: 'mod.topic_reopened', details: { chatId, threadId } });
}

/** Reopen topics whose timer ran out. Runs every minute. */
export async function reopenExpiredTopics() {
  load();
  const now = new Date().toISOString();
  for (const topic of [...closed.values()]) {
    if (!topic.until || topic.until > now) continue;
    // Bot not running: keep the record and retry on the next tick
    if (!botManager.getBotInstance(topic.botId)) continue;
    try {
      await reopenTopic(topic.botId, topic.chatId, topic.threadId);
      console.log(`🔓 Topic ${topic.threadId ?? 'general'} in chat ${topic.chatId} reopened`);
    } catch (err) {
      console.error(`[topics] Failed to reopen topic ${topic.threadId ?? 'general'} in ${topic.chatId}:`, (err as Error).message);
    }
  }
}
