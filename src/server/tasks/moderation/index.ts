import type { TaskModule, TaskContext, TaskConfig, TaskRunLog } from '../types.js';

interface ModerationConfig {
  bannedWords: string[];
  maxLinksPerMessage?: number;
  deleteAndWarn?: boolean;
  warnText?: string;
  // Anti-flood
  antiFlood?: boolean;
  maxMessagesPerMinute?: number; // Max messages from one user per minute
  // Content filters
  blockForwards?: boolean; // Delete forwarded messages
  blockStickers?: boolean; // Delete stickers/GIF
  minMessageLength?: number; // Min chars (0 = no limit)
}

const floodTracker = new Map<string, number[]>(); // `${chatId}:${userId}` → timestamps[]

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
            if (config.warnText) {
              const warn = await msgCtx.reply(`🚫 ${msgCtx.from?.first_name ?? 'Пользователь'}, слишком много сообщений! Подождите минуту.`);
              setTimeout(() => { msgCtx.api.deleteMessage(warn.chat.id, warn.message_id).catch(() => {}); }, 10000);
            }
          } catch {}
          return;
        }
      }

      // Min message length
      if (config.minMessageLength && config.minMessageLength > 0 && text.length < config.minMessageLength) {
        try { await msgCtx.deleteMessage(); } catch {}
        return;
      }

      // Banned words
      if (config.bannedWords?.length) {
        const lower = text.toLowerCase();
        const found = config.bannedWords.find((word) => lower.includes(word.toLowerCase()));
        if (found) {
          try {
            await msgCtx.deleteMessage();
            if (config.deleteAndWarn !== false && config.warnText) {
              const warn = await msgCtx.reply(
                config.warnText.replace('{user}', msgCtx.from?.first_name ?? 'Пользователь'),
                { parse_mode: 'HTML' }
              );
              setTimeout(() => { msgCtx.api.deleteMessage(warn.chat.id, warn.message_id).catch(() => {}); }, 10000);
            }
          } catch {}
          return;
        }
      }

      // Links limit
      if (config.maxLinksPerMessage && config.maxLinksPerMessage > 0) {
        const linkCount = (text.match(/https?:\/\//g) || []).length;
        if (linkCount > config.maxLinksPerMessage) {
          try {
            await msgCtx.deleteMessage();
            if (config.warnText) {
              const warn = await msgCtx.reply('🔗 Слишком много ссылок в сообщении.');
              setTimeout(() => { msgCtx.api.deleteMessage(warn.chat.id, warn.message_id).catch(() => {}); }, 10000);
            }
          } catch {}
        }
      }
    });

    // Block forwards
    if (config.blockForwards) {
      ctx.bot.on('message:forward_origin', async (msgCtx) => {
        try { await msgCtx.deleteMessage(); } catch {}
      });
    }

    // Block stickers
    if (config.blockStickers) {
      ctx.bot.on('message:sticker', async (msgCtx) => {
        try { await msgCtx.deleteMessage(); } catch {}
      });
      ctx.bot.on('message:animation', async (msgCtx) => {
        try { await msgCtx.deleteMessage(); } catch {}
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
        blockForwards: { type: 'boolean' },
        blockStickers: { type: 'boolean' },
        minMessageLength: { type: 'number' },
      },
    };
  }

  validateConfig(_config: TaskConfig): void {}
}
