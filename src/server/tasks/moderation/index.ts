import type { TaskModule, TaskContext, TaskConfig, TaskRunLog } from '../types.js';

interface ModerationConfig {
  bannedWords: string[];
  maxLinksPerMessage?: number;
  deleteAndWarn?: boolean;
  warnText?: string;
}

export class ModerationTask implements TaskModule {
  readonly type = 'moderation';

  onInit(ctx: TaskContext): void {
    const config = ctx.config as unknown as ModerationConfig;
    if (!ctx.bot) return;

    ctx.bot.on('message:text', async (msgCtx) => {
      const text = msgCtx.message.text.toLowerCase();

      // Check banned words
      if (config.bannedWords?.length) {
        const found = config.bannedWords.find((word) => text.includes(word.toLowerCase()));
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
          } catch { /* bot may not have delete permission */ }
          return;
        }
      }

      // Check links limit
      if (config.maxLinksPerMessage && config.maxLinksPerMessage > 0) {
        const linkCount = (text.match(/https?:\/\//g) || []).length;
        if (linkCount > config.maxLinksPerMessage) {
          try {
            await msgCtx.deleteMessage();
            if (config.warnText) {
              const warn = await msgCtx.reply('⚠️ Слишком много ссылок в сообщении.', { parse_mode: 'HTML' });
              setTimeout(() => { msgCtx.api.deleteMessage(warn.chat.id, warn.message_id).catch(() => {}); }, 10000);
            }
          } catch {}
        }
      }
    });
  }

  async onSchedule(_ctx: TaskContext): Promise<TaskRunLog> {
    return { steps: [{ action: 'Модерация', status: 'skipped', detail: 'Модерация работает в реальном времени.' }] };
  }

  getConfigSchema() {
    return {
      type: 'object',
      properties: {
        bannedWords: { type: 'array', items: { type: 'string' }, description: 'Запрещённые слова (удаляет сообщение)' },
        maxLinksPerMessage: { type: 'number', description: 'Макс. ссылок в одном сообщении (0 = без лимита)' },
        deleteAndWarn: { type: 'boolean', default: true, description: 'Предупреждать пользователя после удаления' },
        warnText: { type: 'string', default: '⚠️ {user}, ваше сообщение удалено за нарушение правил.', description: 'Текст предупреждения' },
      },
    };
  }

  validateConfig(_config: TaskConfig): void {}
}
