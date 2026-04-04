import type { TaskModule, TaskContext, TaskConfig, TaskRunLog } from '../types.js';

interface ViolationWarn {
  enabled: boolean;
  texts: string[]; // multiple variants — random pick
}

interface ModerationConfig {
  bannedWords: string[];
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
  minMessageLength?: number;
  shortMsgWarn?: ViolationWarn;
  // Mute
  muteOnViolation?: boolean;
  muteDurationMinutes?: number;
  // Legacy fields (backward compat)
  warnText?: string;
  floodWarnText?: string;
  deleteAndWarn?: boolean;
}

const DEFAULTS: Record<string, string> = {
  bannedWords: '⚠️ {user}, ваше сообщение удалено за нарушение правил.',
  links: '🔗 {user}, ссылки запрещены в этом чате.',
  flood: '🚫 {user}, слишком много сообщений! Подождите минуту.',
  shortMsg: '✏️ {user}, сообщение слишком короткое.',
  forwards: '🚫 {user}, пересланные сообщения запрещены.',
  stickers: '🚫 {user}, стикеры и GIF запрещены.',
  voice: '🚫 {user}, голосовые сообщения запрещены.',
};

/** Build a mention link for the user */
function mentionUser(from: any): string {
  if (!from) return 'Пользователь';
  const name = from.first_name ?? 'Пользователь';
  return `<a href="tg://user?id=${from.id}">${name}</a>`;
}

/** Pick a random warning text, replace {user} with mention, return null if warn disabled */
function pickWarn(warn: ViolationWarn | undefined, fallbackKey: string, from: any, legacyText?: string): string | null {
  const mention = mentionUser(from);

  // New config format
  if (warn) {
    if (!warn.enabled) return null;
    const texts = Array.isArray(warn.texts) ? warn.texts.filter((t: string) => t && t.trim()) : [];
    const template = texts.length > 0 ? texts[Math.floor(Math.random() * texts.length)] : DEFAULTS[fallbackKey];
    return template.replace(/\{user\}/g, mention);
  }
  // Legacy fallback
  if (legacyText) return legacyText.replace(/\{user\}/g, mention);
  return DEFAULTS[fallbackKey].replace(/\{user\}/g, mention);
}

/** Send a warning as reply to the offending message, auto-delete after 10s */
async function sendWarn(msgCtx: any, text: string | null) {
  if (!text) return;
  try {
    const warn = await msgCtx.reply(text, { parse_mode: 'HTML' });
    setTimeout(() => { msgCtx.api.deleteMessage(warn.chat.id, warn.message_id).catch(() => {}); }, 10000);
  } catch (e) { console.error('[moderation] warn send error:', e); }
}

const floodTracker = new Map<string, number[]>();

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

export class ModerationTask implements TaskModule {
  readonly type = 'moderation';

  onInit(ctx: TaskContext): void {
    const config = ctx.config as unknown as ModerationConfig;
    if (!ctx.bot) return;

    const tryMute = async (msgCtx: any, chatId: number, userId: number | undefined) => {
      if (config.muteOnViolation && userId) {
        try { await muteUser(msgCtx.api, chatId, userId, config.muteDurationMinutes ?? 5); } catch (e) { console.error('[moderation] mute error:', e); }
      }
    };

    // Text message moderation
    ctx.bot.on('message:text', async (msgCtx) => {
      const text = msgCtx.message.text;
      const userId = msgCtx.from?.id;
      const chatId = msgCtx.chat.id;

      // Block forwards (check inside message handler to avoid ordering issues)
      if (config.blockForwards && (msgCtx.message as any).forward_origin) {
        try {
          await msgCtx.deleteMessage();
          await sendWarn(msgCtx, pickWarn(config.forwardsWarn, 'forwards', msgCtx.from));
        } catch (e) { console.error('[moderation] forward error:', e); }
        return;
      }

      // Anti-flood
      if (config.antiFlood && config.maxMessagesPerMinute && userId) {
        const key = `${chatId}:${userId}`;
        const now = Date.now();
        const times = floodTracker.get(key) ?? [];
        const recent = times.filter((t) => now - t < 60000);
        recent.push(now);
        floodTracker.set(key, recent);

        if (recent.length > config.maxMessagesPerMinute) {
          try {
            await msgCtx.deleteMessage();
            await tryMute(msgCtx, chatId, userId);
            await sendWarn(msgCtx, pickWarn(config.floodWarn, 'flood', msgCtx.from, config.floodWarnText));
          } catch (e) { console.error('[moderation] flood handler error:', e); }
          return;
        }
      }

      // Min message length
      if (config.minMessageLength && config.minMessageLength > 0 && text.length < config.minMessageLength) {
        try {
          await msgCtx.deleteMessage();
          await sendWarn(msgCtx, pickWarn(config.shortMsgWarn, 'shortMsg', msgCtx.from));
        } catch (e) { console.error('[moderation] short msg error:', e); }
        return;
      }

      // Banned words
      if (config.bannedWords?.length) {
        const lower = text.toLowerCase();
        const found = config.bannedWords.find((word) => lower.includes(word.toLowerCase()));
        if (found) {
          try {
            await msgCtx.deleteMessage();
            await tryMute(msgCtx, chatId, userId);
            const muteNote = config.muteOnViolation ? ` Мут на ${config.muteDurationMinutes ?? 5} мин.` : '';
            const warnMsg = pickWarn(config.bannedWordsWarn, 'bannedWords', msgCtx.from, config.warnText);
            if (warnMsg) await sendWarn(msgCtx, warnMsg + muteNote);
          } catch (e) { console.error('[moderation] banned word error:', e); }
          return;
        }
      }

      // Block links
      if (config.blockLinks || (config.maxLinksPerMessage && config.maxLinksPerMessage > 0)) {
        if (countLinks(text) > 0) {
          try {
            await msgCtx.deleteMessage();
            await sendWarn(msgCtx, pickWarn(config.linksWarn, 'links', msgCtx.from));
          } catch (e) { console.error('[moderation] links error:', e); }
          return;
        }
      }
    });

    // Block forwards
    if (config.blockForwards) {
      ctx.bot.on('message:forward_origin', async (msgCtx) => {
        try {
          await msgCtx.deleteMessage();
          await sendWarn(msgCtx, pickWarn(config.forwardsWarn, 'forwards', msgCtx.from));
        } catch (e) { console.error('[moderation] forward error:', e); }
      });
    }

    // Block stickers
    if (config.blockStickers) {
      ctx.bot.on('message:sticker', async (msgCtx) => {
        try {
          await msgCtx.deleteMessage();
          await sendWarn(msgCtx, pickWarn(config.stickersWarn, 'stickers', msgCtx.from));
        } catch (e) { console.error('[moderation] sticker error:', e); }
      });
      ctx.bot.on('message:animation', async (msgCtx) => {
        try {
          await msgCtx.deleteMessage();
          await sendWarn(msgCtx, pickWarn(config.stickersWarn, 'stickers', msgCtx.from));
        } catch (e) { console.error('[moderation] animation error:', e); }
      });
    }

    // Block voice/video notes
    if (config.blockVoice) {
      ctx.bot.on('message:voice', async (msgCtx) => {
        try {
          await msgCtx.deleteMessage();
          await sendWarn(msgCtx, pickWarn(config.voiceWarn, 'voice', msgCtx.from));
        } catch (e) { console.error('[moderation] voice error:', e); }
      });
      ctx.bot.on('message:video_note', async (msgCtx) => {
        try {
          await msgCtx.deleteMessage();
          await sendWarn(msgCtx, pickWarn(config.voiceWarn, 'voice', msgCtx.from));
        } catch (e) { console.error('[moderation] video_note error:', e); }
      });
    }
  }

  async onSchedule(_ctx: TaskContext): Promise<TaskRunLog> {
    return { steps: [{ action: 'Модерация', status: 'skipped', detail: 'Работает в реальном времени.' }] };
  }

  getConfigSchema() {
    return {
      type: 'object',
      properties: {
        bannedWords: { type: 'array', items: { type: 'string' } },
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
        muteOnViolation: { type: 'boolean' },
        muteDurationMinutes: { type: 'number' },
      },
    };
  }

  validateConfig(_config: TaskConfig): void {}
}
