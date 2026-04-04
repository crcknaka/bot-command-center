import type { TaskModule, TaskContext, TaskConfig, TaskRunLog } from '../types.js';

interface ModerationConfig {
  bannedWords: string[];
  maxLinksPerMessage?: number;
  deleteAndWarn?: boolean;
  warnText?: string;
  // Anti-flood
  antiFlood?: boolean;
  maxMessagesPerMinute?: number; // Max messages from one user per minute
  floodWarnText?: string; // Custom warning text ({user} = username)
  // Content filters
  blockForwards?: boolean; // Delete forwarded messages
  blockStickers?: boolean; // Delete stickers/GIF
  blockVoice?: boolean; // Delete voice messages and video notes
  minMessageLength?: number; // Min chars (0 = no limit)
  // Mute on violation
  muteOnViolation?: boolean; // Restrict user on violation
  muteDurationMinutes?: number; // How long to mute (default 5)
}

const floodTracker = new Map<string, number[]>(); // `${chatId}:${userId}` → timestamps[]

/** Count links including t.me, @mentions with URLs, and bare domains */
function countLinks(text: string): number {
  const patterns = [
    /https?:\/\//gi,           // http:// https://
    /t\.me\//gi,               // t.me/ links
    /(?:^|\s)@\w+/gi,          // @username mentions (potential channel links)
    /(?:^|\s)\w+\.\w{2,}\/\S/gi, // bare domain links like example.com/path
  ];
  let count = 0;
  for (const p of patterns) count += (text.match(p) || []).length;
  return count;
}

/** Mute a user for N minutes */
async function muteUser(api: any, chatId: number, userId: number, minutes: number) {
  const until = Math.floor(Date.now() / 1000) + minutes * 60;
  await api.restrictChatMember(chatId, userId, { permissions: { can_send_messages: false, can_send_other_messages: false, can_add_web_page_previews: false }, until_date: until });
}

export class ModerationTask implements TaskModule {
  readonly type = 'moderation';

  onInit(ctx: TaskContext): void {
    const config = ctx.config as unknown as ModerationConfig;
    if (!ctx.bot) return;

    // Text message moderation
    ctx.bot.on('message:text', async (msgCtx) => {
      const text = msgCtx.message.text;
      const userId = msgCtx.from?.id;
      const chatId = msgCtx.chat.id;

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
            if (config.muteOnViolation && userId) {
              try { await muteUser(msgCtx.api, chatId, userId, config.muteDurationMinutes ?? 5); } catch (e) { console.error('[moderation] mute error:', e); }
            }
            {
              const floodMsg = (config.floodWarnText ?? '🚫 {user}, слишком много сообщений! Подождите минуту.')
                .replace('{user}', msgCtx.from?.first_name ?? 'Пользователь');
              const warn = await msgCtx.reply(floodMsg, { parse_mode: 'HTML' });
              setTimeout(() => { msgCtx.api.deleteMessage(warn.chat.id, warn.message_id).catch(() => {}); }, 10000);
            }
          } catch (e) { console.error('[moderation] flood handler error:', e); }
          return;
        }
      }

      // Min message length
      if (config.minMessageLength && config.minMessageLength > 0 && text.length < config.minMessageLength) {
        try { await msgCtx.deleteMessage(); } catch (e) { console.error('[moderation] delete short message error:', e); }
        return;
      }

      // Banned words
      if (config.bannedWords?.length) {
        const lower = text.toLowerCase();
        const found = config.bannedWords.find((word) => lower.includes(word.toLowerCase()));
        if (found) {
          try {
            await msgCtx.deleteMessage();
            if (config.muteOnViolation && userId) {
              try { await muteUser(msgCtx.api, chatId, userId, config.muteDurationMinutes ?? 5); } catch (e) { console.error('[moderation] mute error:', e); }
            }
            if (config.deleteAndWarn !== false && config.warnText) {
              const muteNote = config.muteOnViolation ? ` Мут на ${config.muteDurationMinutes ?? 5} мин.` : '';
              const warn = await msgCtx.reply(
                config.warnText.replace('{user}', msgCtx.from?.first_name ?? 'Пользователь') + muteNote,
                { parse_mode: 'HTML' }
              );
              setTimeout(() => { msgCtx.api.deleteMessage(warn.chat.id, warn.message_id).catch(() => {}); }, 10000);
            }
          } catch (e) { console.error('[moderation] banned word handler error:', e); }
          return;
        }
      }

      // Links limit (improved: catches t.me/, bare domains, etc.)
      if (config.maxLinksPerMessage && config.maxLinksPerMessage > 0) {
        const linkCount = countLinks(text);
        if (linkCount > config.maxLinksPerMessage) {
          try {
            await msgCtx.deleteMessage();
            if (config.warnText) {
              const warn = await msgCtx.reply('🔗 Слишком много ссылок в сообщении.');
              setTimeout(() => { msgCtx.api.deleteMessage(warn.chat.id, warn.message_id).catch(() => {}); }, 10000);
            }
          } catch (e) { console.error('[moderation] links limit handler error:', e); }
        }
      }
    });

    // Block forwards
    if (config.blockForwards) {
      ctx.bot.on('message:forward_origin', async (msgCtx) => {
        try { await msgCtx.deleteMessage(); } catch (e) { console.error('[moderation] delete forward error:', e); }
      });
    }

    // Block stickers
    if (config.blockStickers) {
      ctx.bot.on('message:sticker', async (msgCtx) => {
        try { await msgCtx.deleteMessage(); } catch (e) { console.error('[moderation] delete sticker error:', e); }
      });
      ctx.bot.on('message:animation', async (msgCtx) => {
        try { await msgCtx.deleteMessage(); } catch (e) { console.error('[moderation] delete animation error:', e); }
      });
    }

    // Block voice messages and video notes
    if (config.blockVoice) {
      ctx.bot.on('message:voice', async (msgCtx) => {
        try { await msgCtx.deleteMessage(); } catch (e) { console.error('[moderation] delete voice error:', e); }
      });
      ctx.bot.on('message:video_note', async (msgCtx) => {
        try { await msgCtx.deleteMessage(); } catch (e) { console.error('[moderation] delete video_note error:', e); }
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
        maxLinksPerMessage: { type: 'number' },
        warnText: { type: 'string' },
        antiFlood: { type: 'boolean' },
        maxMessagesPerMinute: { type: 'number' },
        floodWarnText: { type: 'string' },
        blockForwards: { type: 'boolean' },
        blockStickers: { type: 'boolean' },
        blockVoice: { type: 'boolean' },
        minMessageLength: { type: 'number' },
        muteOnViolation: { type: 'boolean' },
        muteDurationMinutes: { type: 'number' },
      },
    };
  }

  validateConfig(_config: TaskConfig): void {}
}
