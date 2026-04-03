import type { TaskModule, TaskContext, TaskConfig, TaskRunLog } from '../types.js';

interface AutoReplyRule {
  pattern: string;
  response: string;
  isRegex?: boolean;
}

interface AutoReplyConfig {
  rules: AutoReplyRule[];
}

export class AutoReplyTask implements TaskModule {
  readonly type = 'auto_reply';

  onInit(ctx: TaskContext): void {
    const config = ctx.config as unknown as AutoReplyConfig;
    if (!config.rules?.length || !ctx.bot) return;

    ctx.bot.on('message:text', (msgCtx) => {
      const text = msgCtx.message.text;
      for (const rule of config.rules) {
        const matches = rule.isRegex
          ? new RegExp(rule.pattern, 'i').test(text)
          : text.toLowerCase().includes(rule.pattern.toLowerCase());

        if (matches) {
          msgCtx.reply(rule.response, { parse_mode: 'HTML' });
          break;
        }
      }
    });
  }

  async onSchedule(_ctx: TaskContext): Promise<TaskRunLog> {
    return { steps: [{ action: 'Авто-ответы', status: 'skipped', detail: 'Авто-ответы работают в реальном времени, расписание не требуется.' }] };
  }

  getConfigSchema() {
    return {
      type: 'object',
      properties: {
        rules: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              pattern: { type: 'string', description: 'Текст или regex для поиска в сообщении' },
              response: { type: 'string', description: 'Ответ бота (HTML)' },
              isRegex: { type: 'boolean', default: false },
            },
          },
        },
      },
    };
  }

  validateConfig(config: TaskConfig): void {
    const c = config as unknown as AutoReplyConfig;
    if (!c.rules || !Array.isArray(c.rules)) throw new Error('rules должен быть массивом');
  }
}
