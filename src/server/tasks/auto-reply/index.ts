import type { TaskModule, TaskContext, TaskConfig, TaskRunLog } from '../types.js';

interface AutoReplyRule {
  pattern: string;
  response: string;
  isRegex?: boolean;
  replyInDm?: boolean; // Reply in DM instead of group
}

interface AutoReplyConfig {
  rules: AutoReplyRule[];
  cooldownSeconds?: number; // Min seconds between replies to same user
}

const recentReplies = new Map<string, number>(); // `${chatId}:${userId}` → timestamp

export class AutoReplyTask implements TaskModule {
  readonly type = 'auto_reply';

  onInit(ctx: TaskContext): void {
    const config = ctx.config as unknown as AutoReplyConfig;
    if (!config.rules?.length || !ctx.bot) return;
    const cooldown = (config.cooldownSeconds ?? 0) * 1000;

    ctx.bot.on('message:text', async (msgCtx) => {
      const text = msgCtx.message.text;
      const userId = msgCtx.from?.id;

      // Cooldown check
      if (cooldown > 0 && userId) {
        const key = `${msgCtx.chat.id}:${userId}`;
        const last = recentReplies.get(key);
        if (last && Date.now() - last < cooldown) return;
      }

      for (const rule of config.rules) {
        if (!rule.pattern) continue;
        const matches = rule.isRegex
          ? new RegExp(rule.pattern, 'i').test(text)
          : text.toLowerCase().includes(rule.pattern.toLowerCase());

        if (matches) {
          // Update cooldown
          if (cooldown > 0 && userId) {
            recentReplies.set(`${msgCtx.chat.id}:${userId}`, Date.now());
          }

          if (rule.replyInDm && userId) {
            try { await msgCtx.api.sendMessage(userId, rule.response, { parse_mode: 'HTML' }); } catch (e) { console.error('[auto-reply] DM send error:', e); }
          } else {
            await msgCtx.reply(rule.response, { parse_mode: 'HTML' });
          }
          break;
        }
      }
    });
  }

  async onSchedule(_ctx: TaskContext): Promise<TaskRunLog> {
    return { steps: [{ action: 'Авто-ответы', status: 'skipped', detail: 'Работают в реальном времени.' }] };
  }

  getConfigSchema() {
    return { type: 'object', properties: { rules: { type: 'array' }, cooldownSeconds: { type: 'number' } } };
  }

  validateConfig(config: TaskConfig): void {
    const c = config as unknown as AutoReplyConfig;
    if (!c.rules || !Array.isArray(c.rules)) throw new Error('rules должен быть массивом');
  }
}
