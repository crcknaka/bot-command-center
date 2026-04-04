import type { TaskModule, TaskContext, TaskConfig, TaskRunLog } from '../types.js';

interface WelcomeButton {
  text: string;
  url: string;
}

interface WelcomeConfig {
  welcomeText: string;
  deleteAfterSeconds?: number;
  imageUrl?: string; // Welcome image/GIF URL
  buttons?: WelcomeButton[]; // Inline keyboard buttons
  farewellText?: string; // Text when member leaves
  farewellImageUrl?: string; // Farewell image/GIF URL
}

export class WelcomeTask implements TaskModule {
  readonly type = 'welcome';

  onInit(ctx: TaskContext): void {
    const config = ctx.config as unknown as WelcomeConfig;
    if (!ctx.bot) return;

    if (config.welcomeText) {
      ctx.bot.on('chat_member', async (msgCtx, next) => {
        const newMember = msgCtx.chatMember?.new_chat_member;
        if (!newMember || newMember.status !== 'member') { await next(); return; }

        const name = newMember.user.first_name;
        const username = newMember.user.username ? `@${newMember.user.username}` : name;
        const text = config.welcomeText
          .replace(/\{name\}/g, name)
          .replace(/\{username\}/g, username);

        // Build inline keyboard
        let reply_markup: any = undefined;
        if (config.buttons?.length) {
          reply_markup = {
            inline_keyboard: [config.buttons.filter(b => b.text && b.url).map(b => ({ text: b.text, url: b.url }))],
          };
        }

        let msg;
        try {
          if (config.imageUrl) {
            if (/\.gif$/i.test(config.imageUrl) || config.imageUrl.includes('giphy')) {
              msg = await msgCtx.api.sendAnimation(msgCtx.chat.id, config.imageUrl, { caption: text, parse_mode: 'HTML', reply_markup });
            } else {
              msg = await msgCtx.api.sendPhoto(msgCtx.chat.id, config.imageUrl, { caption: text, parse_mode: 'HTML', reply_markup });
            }
          } else {
            msg = await msgCtx.reply(text, { parse_mode: 'HTML', reply_markup });
          }
        } catch (e) {
          console.error('[welcome] send welcome error:', e);
          // Fallback to text-only if image fails
          try {
            msg = await msgCtx.reply(text, { parse_mode: 'HTML', reply_markup });
          } catch (e2) {
            console.error('[welcome] fallback text error:', e2);
            return;
          }
        }

        if (config.deleteAfterSeconds && config.deleteAfterSeconds > 0 && msg) {
          setTimeout(async () => {
            try {
              await msgCtx.api.deleteMessage(msg.chat.id, msg.message_id);
            } catch (e) { console.error('[welcome] delete message error:', e); }
          }, config.deleteAfterSeconds * 1000);
        }
        await next();
      });
    }

    // Farewell message
    if (config.farewellText) {
      ctx.bot.on('chat_member', async (msgCtx, next) => {
        const oldMember = msgCtx.chatMember?.old_chat_member;
        const newMember = msgCtx.chatMember?.new_chat_member;
        if (!oldMember || !newMember) { await next(); return; }
        // User left or was kicked
        if ((oldMember.status === 'member' || oldMember.status === 'administrator') && (newMember.status === 'left' || newMember.status === 'kicked')) {
          const name = oldMember.user.first_name;
          const username = oldMember.user.username ? `@${oldMember.user.username}` : name;
          const text = config.farewellText!
            .replace(/\{name\}/g, name)
            .replace(/\{username\}/g, username);

          try {
            let msg;
            if (config.farewellImageUrl) {
              try {
                if (/\.gif$/i.test(config.farewellImageUrl) || config.farewellImageUrl.includes('giphy')) {
                  msg = await msgCtx.api.sendAnimation(msgCtx.chat.id, config.farewellImageUrl, { caption: text, parse_mode: 'HTML' });
                } else {
                  msg = await msgCtx.api.sendPhoto(msgCtx.chat.id, config.farewellImageUrl, { caption: text, parse_mode: 'HTML' });
                }
              } catch {
                msg = await msgCtx.reply(text, { parse_mode: 'HTML' });
              }
            } else {
              msg = await msgCtx.reply(text, { parse_mode: 'HTML' });
            }
            // Auto-delete farewell after 30 seconds
            if (msg) setTimeout(() => { msgCtx.api.deleteMessage(msg.chat.id, msg.message_id).catch(() => {}); }, 30000);
          } catch (e) { console.error('[welcome] farewell error:', e); }
        }
        await next();
      });
    }
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
        imageUrl: { type: 'string', description: 'URL картинки или GIF для приветствия' },
        buttons: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, url: { type: 'string' } } } },
        farewellText: { type: 'string', description: 'Текст при выходе участника' },
      },
    };
  }

  validateConfig(config: TaskConfig): void {
    const c = config as unknown as WelcomeConfig;
    if (!c.welcomeText && !c.farewellText) throw new Error('Нужен хотя бы текст приветствия или прощания');
  }
}
