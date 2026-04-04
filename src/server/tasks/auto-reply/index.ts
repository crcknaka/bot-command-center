import type { TaskModule, TaskContext, TaskConfig, TaskRunLog } from '../types.js';

interface AutoReplyRule {
  pattern: string;
  response: string;
  isRegex?: boolean;
  exactMatch?: boolean; // Match whole word, not substring
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
    if (!config.rules?.length || !ctx.bot) {
      console.log(`[auto-reply] Task#${ctx.taskId} skipped: rules=${config.rules?.length ?? 0}, bot=${!!ctx.bot}`);
      return;
    }
    console.log(`[auto-reply] Task#${ctx.taskId} registered ${config.rules.length} rule(s) for chat ${ctx.chatId}`);
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
        let matches = false;
        try {
          if (rule.isRegex) {
            matches = new RegExp(rule.pattern, 'i').test(text);
          } else if (rule.exactMatch) {
            // Match as whole word (with word boundaries)
            const escaped = rule.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            matches = new RegExp(`(?:^|\\s|[^а-яёa-z])${escaped}(?:$|\\s|[^а-яёa-z])`, 'i').test(text)
              || text.toLowerCase() === rule.pattern.toLowerCase(); // exact full message match
          } else {
            matches = text.toLowerCase().includes(rule.pattern.toLowerCase());
          }
        } catch (e) {
          console.error(`[auto-reply] Invalid pattern "${rule.pattern}":`, e);
          continue;
        }

        if (matches) {
          // Update cooldown
          if (cooldown > 0 && userId) {
            recentReplies.set(`${msgCtx.chat.id}:${userId}`, Date.now());
          }

          const response = rule.response
            .replace(/\{user\}/g, msgCtx.from?.first_name ?? 'Пользователь')
            .replace(/\{username\}/g, msgCtx.from?.username ? `@${msgCtx.from.username}` : msgCtx.from?.first_name ?? '')
            .replace(/\{chatTitle\}/g, 'title' in msgCtx.chat ? (msgCtx.chat as any).title : '');

          if (rule.replyInDm && userId) {
            try {
              await msgCtx.api.sendMessage(userId, response, { parse_mode: 'HTML' });
            } catch {
              // Fallback: если ЛС не удалось (юзер не начал чат) — ответить в группе
              await msgCtx.reply(response, { parse_mode: 'HTML' });
            }
          } else {
            await msgCtx.reply(response, { parse_mode: 'HTML' });
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
