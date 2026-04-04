import type { TaskModule, TaskContext, TaskConfig, TaskRunLog } from '../types.js';

interface WelcomeConfig {
  welcomeText: string;
  deleteAfterSeconds?: number;
}

export class WelcomeTask implements TaskModule {
  readonly type = 'welcome';

  onInit(ctx: TaskContext): void {
    const config = ctx.config as unknown as WelcomeConfig;
    if (!config.welcomeText || !ctx.bot) return;

    ctx.bot.on('chat_member', async (msgCtx) => {
      const newMember = msgCtx.chatMember?.new_chat_member;
      if (!newMember || newMember.status !== 'member') return;

      const name = newMember.user.first_name;
      const text = config.welcomeText
        .replace('{name}', name)
        .replace('{username}', newMember.user.username ? `@${newMember.user.username}` : name);

      const msg = await msgCtx.reply(text, { parse_mode: 'HTML' });

      if (config.deleteAfterSeconds && config.deleteAfterSeconds > 0) {
        setTimeout(async () => {
          try {
            await msgCtx.api.deleteMessage(msg.chat.id, msg.message_id);
          } catch (e) { console.error('[welcome] delete message error:', e); }
        }, config.deleteAfterSeconds * 1000);
      }
    });
  }

  async onSchedule(_ctx: TaskContext): Promise<TaskRunLog> {
    return { steps: [{ action: 'Приветствия', status: 'skipped', detail: 'Приветствия работают в реальном времени при входе нового участника.' }] };
  }

  getConfigSchema() {
    return {
      type: 'object',
      properties: {
        welcomeText: { type: 'string', description: 'Текст приветствия. {name} — имя, {username} — @username' },
        deleteAfterSeconds: { type: 'number', description: 'Удалить приветствие через N секунд (0 = не удалять)' },
      },
    };
  }

  validateConfig(config: TaskConfig): void {
    const c = config as unknown as WelcomeConfig;
    if (!c.welcomeText) throw new Error('welcomeText обязателен');
  }
}
