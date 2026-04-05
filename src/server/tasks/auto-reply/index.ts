import type { TaskModule, TaskContext, TaskConfig, TaskRunLog } from '../types.js';

interface AutoReplyRule {
  pattern: string; // legacy single pattern
  patterns?: string[]; // multiple patterns — any match triggers
  response: string; // legacy single response
  responses?: string[]; // multiple responses — random pick
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

    ctx.bot.on('message:text', async (msgCtx, next) => {
      const text = msgCtx.message.text;
      const userId = msgCtx.from?.id;

      // Cooldown check
      if (cooldown > 0 && userId) {
        const key = `${msgCtx.chat.id}:${userId}`;
        const last = recentReplies.get(key);
        if (last && Date.now() - last < cooldown) return;
      }

      for (const rule of config.rules) {
        // Collect all patterns (new array + legacy single)
        const allPatterns = rule.patterns?.filter(p => p.trim()) ?? [];
        if (allPatterns.length === 0 && rule.pattern) allPatterns.push(rule.pattern);
        if (allPatterns.length === 0) continue;

        let matches = false;
        try {
          for (const pattern of allPatterns) {
            if (rule.isRegex) {
              if (new RegExp(pattern, 'i').test(text)) { matches = true; break; }
            } else if (rule.exactMatch) {
              const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              if (new RegExp(`(?:^|\\s|[^а-яёa-z])${escaped}(?:$|\\s|[^а-яёa-z])`, 'i').test(text)
                || text.toLowerCase() === pattern.toLowerCase()) { matches = true; break; }
            } else {
              if (text.toLowerCase().includes(pattern.toLowerCase())) { matches = true; break; }
            }
          }
        } catch (e) {
          console.error(`[auto-reply] Invalid pattern:`, e);
          continue;
        }

        if (matches) {
          // Update cooldown
          if (cooldown > 0 && userId) {
            recentReplies.set(`${msgCtx.chat.id}:${userId}`, Date.now());
          }

          // Pick response: from responses[] array (random) or legacy single response
          const allResponses = rule.responses?.filter(r => r.trim()) ?? [];
          const template = allResponses.length > 0
            ? allResponses[Math.floor(Math.random() * allResponses.length)]
            : rule.response;
          const response = template
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
          return; // matched — don't call next
        }
      }
      // No rule matched — let other handlers run
      await next();
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
