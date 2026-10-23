import type { TaskModule, TaskContext, TaskConfig, TaskRunLog } from '../types.js';
import { logActivity } from '../../services/activity.js';
import { db } from '../../db/client.js';
import { channels } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { findBannedWord } from './match.js';

interface ViolationWarn {
  enabled: boolean;
  texts: string[]; // multiple variants — random pick
}

interface ModerationConfig {
  bannedWords: string[];
  allowedWords?: string[]; // exceptions: words that contain a banned root but are fine (спидран)
  bannedWordsWarn?: ViolationWarn;
  blockLinks?: boolean; // Delete messages with links
  maxLinksPerMessage?: number; // Legacy — treated as blockLinks if > 0
  linksWarn?: ViolationWarn;
  // Anti-flood
  antiFlood?: boolean;
  maxMessagesPerMinute?: number;
  floodWarn?: ViolationWarn;
  // Content filters
  blockForwards?: boolean;
  forwardsWarn?: ViolationWarn;
  blockStickers?: boolean;
  stickersWarn?: ViolationWarn;
  blockVoice?: boolean;
  voiceWarn?: ViolationWarn;
  blockVideoNotes?: boolean; // unset = follows blockVoice (legacy: one switch for both)
  videoNotesWarn?: ViolationWarn;
  minMessageLength?: number;
  shortMsgWarn?: ViolationWarn;
  // Warnings behavior
  warnDeleteSeconds?: number; // 0 = don't delete, >0 = auto-delete after N sec (default 10)
  // Strike system
  strikesEnabled?: boolean;
  maxStrikes?: number; // default 3
  strikeMuteDuration?: number; // minutes, default 60
  strikeResetHours?: number; // default 24
  strikeWarnText?: string; // custom text for strike warnings ({user}, {n}, {max})
  strikeMuteText?: string; // custom text when max strikes reached
  // Banned words behavior
  deleteOnBan?: boolean; // true = delete message (default true), false = keep message
  // Mute
  muteOnViolation?: boolean;
  muteDurationMinutes?: number;
  // Scope and exemptions
  chatIds?: string[]; // groups the rules apply to (empty = every group of the bot)
  exemptAdmins?: boolean; // skip chat admins (default true)
  trustedUserIds?: number[]; // users the rules never apply to
  trustedUsers?: Array<{ id: number; name: string }>; // display names for trustedUserIds
  // Legacy fields (backward compat)
  warnText?: string;
  floodWarnText?: string;
  deleteAndWarn?: boolean;
}

const DEFAULTS_DELETE: Record<string, string> = {
  bannedWords: '⚠️ {user}, ваше сообщение удалено за нарушение правил.',
  links: '🔗 {user}, сообщение удалено — ссылки запрещены.',
  flood: '🚫 {user}, слишком много сообщений! Подождите минуту.',
  shortMsg: '✏️ {user}, сообщение удалено — слишком короткое.',
  forwards: '🚫 {user}, пересланное сообщение удалено.',
  stickers: '🚫 {user}, стикер удалён — стикеры и GIF запрещены.',
  voice: '🚫 {user}, голосовое сообщение удалено.',
  videoNotes: '🚫 {user}, видео-кружок удалён.',
};

const DEFAULTS_WARN: Record<string, string> = {
  bannedWords: '⚠️ {user}, пожалуйста, соблюдайте правила чата.',
  links: '🔗 {user}, ссылки запрещены в этом чате.',
  flood: '🚫 {user}, слишком много сообщений! Подождите минуту.',
  shortMsg: '✏️ {user}, пишите более развёрнуто.',
  forwards: '🚫 {user}, пересланные сообщения не приветствуются.',
  stickers: '🚫 {user}, стикеры и GIF запрещены в этом чате.',
  voice: '🚫 {user}, голосовые сообщения запрещены в этом чате.',
  videoNotes: '🚫 {user}, видео-кружки запрещены в этом чате.',
};

/** Build a mention link for the user */
function mentionUser(from: any): string {
  if (!from) return 'Пользователь';
  const name = from.first_name ?? 'Пользователь';
  return `<a href="tg://user?id=${from.id}">${name}</a>`;
}

/** Pick a random warning text, replace {user} with mention, return null if warn disabled */
function pickWarn(warn: ViolationWarn | undefined, fallbackKey: string, from: any, isDelete: boolean, legacyText?: string): string | null {
  const mention = mentionUser(from);
  const defaults = isDelete ? DEFAULTS_DELETE : DEFAULTS_WARN;

  // New config format
  if (warn) {
    if (!warn.enabled) return null;
    const texts = Array.isArray(warn.texts) ? warn.texts.filter((t: string) => t && t.trim()) : [];
    const template = texts.length > 0 ? texts[Math.floor(Math.random() * texts.length)] : defaults[fallbackKey];
    return template.replace(/\{user\}/g, mention);
  }
  // Legacy fallback
  if (legacyText) return legacyText.replace(/\{user\}/g, mention);
  return defaults[fallbackKey].replace(/\{user\}/g, mention);
}

/** Send a warning, optionally auto-delete after N seconds */
async function sendWarn(msgCtx: any, text: string | null, deleteAfterSec?: number) {
  if (!text) return;
  try {
    const warn = await msgCtx.reply(text, { parse_mode: 'HTML' });
    if (deleteAfterSec && deleteAfterSec > 0) {
      setTimeout(() => { msgCtx.api.deleteMessage(warn.chat.id, warn.message_id).catch(() => {}); }, deleteAfterSec * 1000);
    }
  } catch (e) { console.error('[moderation] warn send error:', e); }
}

const floodTracker = new Map<string, number[]>();
let lastFloodCleanup = Date.now();

/** Strike tracker: `${chatId}:${userId}` → { count, lastViolation } */
const strikeTracker = new Map<string, { count: number; lastViolation: number }>();
let lastStrikeCleanup = Date.now();

/** Periodic cleanup to prevent unbounded memory growth */
function cleanupFloodTracker() {
  const now = Date.now();
  if (now - lastFloodCleanup < 60_000) return; // cleanup at most once per minute
  lastFloodCleanup = now;
  for (const [key, times] of floodTracker) {
    const recent = times.filter(t => now - t < 60_000);
    if (recent.length === 0) floodTracker.delete(key);
    else floodTracker.set(key, recent);
  }
}

function cleanupStrikeTracker(resetHours: number) {
  const now = Date.now();
  if (now - lastStrikeCleanup < 300_000) return; // cleanup at most once per 5 minutes
  lastStrikeCleanup = now;
  const resetMs = resetHours * 3600 * 1000;
  for (const [key, data] of strikeTracker) {
    if (now - data.lastViolation > resetMs) strikeTracker.delete(key);
  }
}

/** Get/increment strike count for a user */
function getStrikes(chatId: number, userId: number, resetHours: number): number {
  const key = `${chatId}:${userId}`;
  const existing = strikeTracker.get(key);
  const now = Date.now();

  if (existing) {
    // Reset if enough time passed
    if (now - existing.lastViolation > resetHours * 3600 * 1000) {
      strikeTracker.set(key, { count: 1, lastViolation: now });
      return 1;
    }
    existing.count++;
    existing.lastViolation = now;
    return existing.count;
  }

  strikeTracker.set(key, { count: 1, lastViolation: now });
  return 1;
}

/** Count links including t.me, @mentions, bare domains */
function countLinks(text: string): number {
  const patterns = [
    /https?:\/\//gi,
    /t\.me\//gi,
    /(?:^|\s)@\w+/gi,
    /(?:^|\s)\w+\.\w{2,}\/\S/gi,
  ];
  let count = 0;
  for (const p of patterns) count += (text.match(p) || []).length;
  return count;
}

async function muteUser(api: any, chatId: number, userId: number, minutes: number) {
  const until = Math.floor(Date.now() / 1000) + minutes * 60;
  await api.restrictChatMember(chatId, userId, { permissions: { can_send_messages: false, can_send_other_messages: false, can_add_web_page_previews: false }, until_date: until });
}

const ADMIN_CACHE_MS = 5 * 60_000;
const adminCache = new Map<number, { ids: Set<number>; at: number }>();

/** Chat admins, cached so moderation does not call Telegram on every message */
async function isChatAdmin(api: any, chatId: number, userId: number): Promise<boolean> {
  const cached = adminCache.get(chatId);
  if (cached && Date.now() - cached.at < ADMIN_CACHE_MS) return cached.ids.has(userId);
  try {
    const admins = await api.getChatAdministrators(chatId);
    const ids = new Set<number>(admins.map((a: any) => a.user.id));
    adminCache.set(chatId, { ids, at: Date.now() });
    return ids.has(userId);
  } catch (e) {
    console.error('[moderation] admin list error:', e);
    // Keep the stale list if there is one; otherwise treat the author as a regular member
    return cached?.ids.has(userId) ?? false;
  }
}

/** Forget cached admins of a chat (after promoting or demoting someone) */
export function invalidateAdminCache(chatId: number) {
  adminCache.delete(chatId);
}

export class ModerationTask implements TaskModule {
  readonly type = 'moderation';

  onInit(ctx: TaskContext): void {
    if (!ctx.bot) return;

    // Live view of the task config: the bot manager swaps ctx.config when rules change,
    // so handlers always read current values without a bot restart.
    const config = new Proxy({}, { get: (_t, key) => (ctx.config as any)?.[key] }) as ModerationConfig;

    // Resolve bot and channel info for logging
    const channelRow = db.select().from(channels).where(eq(channels.id, ctx.channelId)).limit(1).get();
    const botId = channelRow?.botId ?? null;
    const chatTitle = channelRow?.title ?? ctx.chatId;

    /** Whether the rules apply to this message: task on, chat in scope, author not exempt */
    const applies = async (msgCtx: any): Promise<boolean> => {
      if (ctx.enabled === false) return false;
      const chat = msgCtx.chat;
      const msg = msgCtx.message;
      if (!chat || chat.type === 'private' || !msg) return false;
      if (config.chatIds?.length && !config.chatIds.includes(String(chat.id))) return false;
      // Channel posts mirrored into the linked discussion group are not user messages
      if (msg.is_automatic_forward) return false;
      const from = msgCtx.from;
      if (!from) return false;
      if (config.trustedUserIds?.includes(from.id)) return false;
      if (config.exemptAdmins !== false) {
        // Anonymous admins post on behalf of the chat itself
        if (msg.sender_chat?.id === chat.id) return false;
        if (await isChatAdmin(msgCtx.api, chat.id, from.id)) return false;
      }
      return true;
    };

    const warn = async (msgCtx: any, text: string | null) => {
      await sendWarn(msgCtx, text, config.warnDeleteSeconds ?? 10);
      if (text) logMod('warned', msgCtx, 'warning_sent');
    };

    const logMod = (action: string, msgCtx: any, reason: string) => {
      const msg = msgCtx.message ?? msgCtx.update?.message;
      const messageText = (msg?.text ?? msg?.caption ?? '').slice(0, 300) || undefined;
      logActivity({
        botId,
        action: `mod.${action}`,
        details: { userId: msgCtx.from?.id, userName: msgCtx.from?.first_name, chatId: msgCtx.chat?.id, chatTitle, reason, messageText },
      });
    };

    /** Handle a violation: delete message, issue strike if enabled, warn, optionally mute */
    const handleViolation = async (msgCtx: any, chatId: number, userId: number | undefined, reason: string, warnConfig: ViolationWarn | undefined, warnKey: string) => {
      cleanupStrikeTracker(config.strikeResetHours ?? 24);
      // Delete message or keep it
      if (config.deleteOnBan !== false) {
        try {
          await msgCtx.deleteMessage();
          logMod('deleted', msgCtx, reason);
        } catch (e) { console.error('[moderation] delete error:', e); }
      }

      const mention = mentionUser(msgCtx.from);

      // Always send violation-specific warning first (e.g. "ссылки запрещены")
      const violationText = pickWarn(warnConfig, warnKey, msgCtx.from, config.deleteOnBan !== false);

      if (config.strikesEnabled && userId) {
        const maxStrikes = config.maxStrikes ?? 3;
        const resetHours = config.strikeResetHours ?? 24;
        const strikes = getStrikes(chatId, userId, resetHours);

        if (strikes >= maxStrikes) {
          const muteMins = config.strikeMuteDuration ?? 60;
          try {
            await muteUser(msgCtx.api, chatId, userId, muteMins);
            logMod('muted', msgCtx, `strikes:${strikes}/${maxStrikes}`);
          } catch (e) { console.error('[moderation] strike mute error:', e); }
          const muteText = (config.strikeMuteText ?? '🚫 {user}, {n}/{max} предупреждений. Мут на {mins} мин.')
            .replace(/\{user\}/g, mention).replace(/\{n\}/g, String(strikes)).replace(/\{max\}/g, String(maxStrikes)).replace(/\{mins\}/g, String(muteMins));
          await warn(msgCtx, violationText ? `${violationText}\n${muteText}` : muteText);
          strikeTracker.delete(`${chatId}:${userId}`);
        } else {
          const strikeText = (config.strikeWarnText ?? '⚠️ {user}, предупреждение {n}/{max}.')
            .replace(/\{user\}/g, mention).replace(/\{n\}/g, String(strikes)).replace(/\{max\}/g, String(maxStrikes));
          await warn(msgCtx, violationText ? `${violationText}\n${strikeText}` : strikeText);
        }
      } else {
        if (config.muteOnViolation && userId) {
          try {
            await muteUser(msgCtx.api, chatId, userId, config.muteDurationMinutes ?? 5);
            logMod('muted', msgCtx, reason);
          } catch (e) { console.error('[moderation] mute error:', e); }
        }
        await warn(msgCtx, pickWarn(warnConfig, warnKey, msgCtx.from, config.deleteOnBan !== false));
      }
    };

    const tryMute = async (msgCtx: any, chatId: number, userId: number | undefined, reason: string) => {
      if (config.muteOnViolation && userId) {
        try {
          await muteUser(msgCtx.api, chatId, userId, config.muteDurationMinutes ?? 5);
          logMod('muted', msgCtx, reason);
        } catch (e) { console.error('[moderation] mute error:', e); }
      }
    };

    // Text message moderation (call next() to let other handlers run)
    ctx.bot.on('message:text', async (msgCtx, next) => {
      if (!(await applies(msgCtx))) return next();

      const text = msgCtx.message.text;
      const userId = msgCtx.from?.id;
      const chatId = msgCtx.chat.id;

      // Block forwards (check inside message handler to avoid ordering issues)
      if (config.blockForwards && (msgCtx.message as any).forward_origin) {
        try {
          await msgCtx.deleteMessage();
          logMod('deleted', msgCtx, 'forward');
          await warn(msgCtx, pickWarn(config.forwardsWarn, 'forwards', msgCtx.from, true));
        } catch (e) { console.error('[moderation] forward error:', e); }
        return;
      }

      // Anti-flood (with periodic cleanup)
      if (config.antiFlood && config.maxMessagesPerMinute && userId) {
        cleanupFloodTracker();
        const key = `${chatId}:${userId}`;
        const now = Date.now();
        const times = floodTracker.get(key) ?? [];
        const recent = times.filter((t) => now - t < 60000);
        recent.push(now);
        floodTracker.set(key, recent);

        if (recent.length > config.maxMessagesPerMinute) {
          try {
            await msgCtx.deleteMessage();
            logMod('deleted', msgCtx, 'flood');
            await tryMute(msgCtx, chatId, userId, 'flood');
            await warn(msgCtx, pickWarn(config.floodWarn, 'flood', msgCtx.from, true, config.floodWarnText));
          } catch (e) { console.error('[moderation] flood handler error:', e); }
          return;
        }
      }

      // Min message length
      if (config.minMessageLength && config.minMessageLength > 0 && text.length < config.minMessageLength) {
        try {
          await msgCtx.deleteMessage();
          logMod('deleted', msgCtx, 'short_message');
          await warn(msgCtx, pickWarn(config.shortMsgWarn, 'shortMsg', msgCtx.from, true));
        } catch (e) { console.error('[moderation] short msg error:', e); }
        return;
      }

      // Banned words (check original + translit normalized version, minus exception words)
      if (config.bannedWords?.length) {
        const found = findBannedWord(text, config.bannedWords, config.allowedWords);
        if (found) {
          await handleViolation(msgCtx, chatId, userId, `banned_word:${found}`, config.bannedWordsWarn, 'bannedWords');
          return;
        }
      }

      // Block links (blockLinks explicitly set takes priority over legacy maxLinksPerMessage)
      if (config.blockLinks) {
        if (countLinks(text) > 0) {
          await handleViolation(msgCtx, chatId, userId, 'links', config.linksWarn, 'links');
          return;
        }
      }

      // Message passed all checks — let other handlers (auto-reply etc.) process it
      await next();
    });

    /** Register a media filter: deletes the message while its rule is switched on */
    const blockMedia = (
      filter: 'message:forward_origin' | 'message:sticker' | 'message:animation' | 'message:voice' | 'message:video_note',
      reason: string,
      rule: () => { on: boolean | undefined; warn: ViolationWarn | undefined; warnKey: string },
    ) => {
      ctx.bot.on(filter, async (msgCtx, next) => {
        const { on, warn: warnConfig, warnKey } = rule();
        if (on && await applies(msgCtx)) {
          try {
            await msgCtx.deleteMessage();
            logMod('deleted', msgCtx, reason);
            await warn(msgCtx, pickWarn(warnConfig, warnKey, msgCtx.from, true));
          } catch (e) { console.error(`[moderation] ${reason} error:`, e); }
        }
        await next();
      });
    };

    // Forwards without text (e.g. forwarded photos); text forwards are handled above
    blockMedia('message:forward_origin', 'forward', () => ({ on: config.blockForwards, warn: config.forwardsWarn, warnKey: 'forwards' }));
    blockMedia('message:sticker', 'sticker', () => ({ on: config.blockStickers, warn: config.stickersWarn, warnKey: 'stickers' }));
    blockMedia('message:animation', 'animation', () => ({ on: config.blockStickers, warn: config.stickersWarn, warnKey: 'stickers' }));
    blockMedia('message:voice', 'voice', () => ({ on: config.blockVoice, warn: config.voiceWarn, warnKey: 'voice' }));
    // Video notes follow the voice switch until they get their own setting
    blockMedia('message:video_note', 'video_note', () => config.blockVideoNotes === undefined
      ? { on: config.blockVoice, warn: config.voiceWarn, warnKey: 'voice' }
      : { on: config.blockVideoNotes, warn: config.videoNotesWarn, warnKey: 'videoNotes' });
  }

  async onSchedule(_ctx: TaskContext): Promise<TaskRunLog> {
    return { steps: [{ action: 'Модерация', status: 'skipped', detail: 'Работает в реальном времени.' }] };
  }

  getConfigSchema() {
    return {
      type: 'object',
      properties: {
        bannedWords: { type: 'array', items: { type: 'string' } },
        allowedWords: { type: 'array', items: { type: 'string' } },
        bannedWordsWarn: { type: 'object' },
        blockLinks: { type: 'boolean' },
        linksWarn: { type: 'object' },
        antiFlood: { type: 'boolean' },
        maxMessagesPerMinute: { type: 'number' },
        floodWarn: { type: 'object' },
        blockForwards: { type: 'boolean' },
        forwardsWarn: { type: 'object' },
        blockStickers: { type: 'boolean' },
        stickersWarn: { type: 'object' },
        blockVoice: { type: 'boolean' },
        voiceWarn: { type: 'object' },
        minMessageLength: { type: 'number' },
        shortMsgWarn: { type: 'object' },
        warnDeleteSeconds: { type: 'number' },
        muteOnViolation: { type: 'boolean' },
        muteDurationMinutes: { type: 'number' },
      },
    };
  }

  validateConfig(_config: TaskConfig): void {}
}
