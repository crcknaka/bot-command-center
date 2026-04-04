import { Bot } from 'grammy';
import { db } from '../db/client.js';
import { bots, channels, tasks, messageStats } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { scheduler } from '../services/scheduler.js';
import { getTaskModule } from '../tasks/registry.js';
import { sources } from '../db/schema.js';
import { registerTelegramSourceListener } from '../tasks/news-feed/telegram-source.js';

interface RunningBot {
  botId: number;
  bot: Bot;
  username: string;
  cronJobIds: string[];
}

class BotManager {
  private running = new Map<number, RunningBot>();
  private starting = new Set<number>();

  async startAll() {
    // Start all bots (active + stopped) on server startup, skip only error
    const allBots = db.select().from(bots).all().filter(b => b.status !== 'error');
    for (const botRecord of allBots) {
      try {
        await this.startBot(botRecord.id);
      } catch (err) {
        console.error(`❌ Failed to start bot ${botRecord.name}:`, (err as Error).message);
      }
    }
  }

  async startBot(botId: number) {
    if (this.running.has(botId) || this.starting.has(botId)) {
      console.log(`⚠️  Bot ${botId} is already running or starting`);
      return;
    }

    this.starting.add(botId);
    try {
      await this._startBotInternal(botId);
    } finally {
      this.starting.delete(botId);
    }
  }

  private async _startBotInternal(botId: number) {
    const botRecord = db.select().from(bots).where(eq(bots.id, botId)).limit(1).get();
    if (!botRecord) throw new Error(`Bot ${botId} not found`);

    const bot = new Bot(botRecord.token);

    let me;
    try {
      me = await bot.api.getMe();
    } catch (err) {
      const msg = (err as Error).message;
      db.update(bots).set({ status: 'error', errorMessage: `Токен недействителен: ${msg}`, updatedAt: new Date().toISOString() }).where(eq(bots.id, botId)).run();
      throw new Error(`Не удалось подключиться к Telegram: ${msg}`);
    }

    db.update(bots)
      .set({ username: me.username, status: 'active', errorMessage: null, updatedAt: new Date().toISOString() })
      .where(eq(bots.id, botId))
      .run();

    // Basic commands
    bot.command('start', (ctx) => {
      ctx.reply(`👋 Я ${me.first_name}, управляюсь через Bot Command Center.`);
    });
    bot.command('status', (ctx) => {
      ctx.reply('✅ Бот работает.');
    });

    bot.catch((err) => {
      console.error(`❌ Bot @${me.username} error:`, err.message);
    });

    // ── Message stats middleware (before task handlers) ──────────────────
    bot.on('message', (ctx, next) => {
      try {
        const from = ctx.from;
        if (!from || from.is_bot) return next(); // skip bots

        const msg = ctx.message;
        let messageType = 'other';
        let textLength = 0;

        if (msg.text) { messageType = 'text'; textLength = msg.text.length; }
        else if (msg.photo) messageType = 'photo';
        else if (msg.video) messageType = 'video';
        else if (msg.sticker) messageType = 'sticker';
        else if (msg.voice) messageType = 'voice';
        else if (msg.video_note) messageType = 'video_note';
        else if (msg.animation) messageType = 'animation';
        else if (msg.document) messageType = 'document';
        else if (msg.audio) messageType = 'audio';

        if ((msg as any).forward_origin) messageType = 'forward';

        db.insert(messageStats).values({
          chatId: String(ctx.chat.id),
          userId: from.id,
          userName: from.first_name,
          username: from.username ?? null,
          messageType,
          threadId: (msg as any).message_thread_id ?? null,
          textLength,
          textPreview: (msg.text ?? msg.caption ?? '').slice(0, 200) || null,
        }).run();

        // Ensure numeric chatId exists in channels for analytics
        const chatTitle = 'title' in ctx.chat ? (ctx.chat as any).title : null;
        if (chatTitle) {
          const numericId = String(ctx.chat.id);
          const existsByNumeric = db.select().from(channels).all().find(ch => ch.chatId === numericId);
          if (!existsByNumeric) {
            try {
              db.insert(channels).values({ botId: botId, chatId: numericId, title: chatTitle, type: ctx.chat.type as any, isLinked: true }).run();
            } catch {}
          }
        }
      } catch (e) {
        // Don't break message handling if stats fail
      }
      return next();
    });

    // ── Reaction stats middleware ───────────────────────────────────────
    bot.on('message_reaction', (ctx) => {
      try {
        const reaction = ctx.messageReaction;
        if (!reaction) return;
        const from = reaction.user;
        if (!from || from.is_bot) return;

        const newReactions = reaction.new_reaction ?? [];
        for (const r of newReactions) {
          const emoji = (r as any).emoji ?? (r as any).custom_emoji_id ?? '?';
          db.insert(messageStats).values({
            chatId: String(reaction.chat.id),
            userId: from.id,
            userName: from.first_name,
            username: from.username ?? null,
            messageType: 'reaction',
            threadId: null,
            textLength: 0,
            textPreview: emoji,
          }).run();
        }
      } catch (e) { console.error('[stats] reaction error:', e); }
    });

    // ── Load channels → tasks → register cron + onInit ──────────────────
    const cronJobIds: string[] = [];
    const botChannels = db.select().from(channels).where(eq(channels.botId, botId)).all();

    for (const channel of botChannels) {
      const channelTasks = db.select().from(tasks).where(eq(tasks.channelId, channel.id)).all();

      for (const task of channelTasks) {
        if (!task.enabled) continue;

        const taskModule = getTaskModule(task.type);
        const taskCtx = {
          taskId: task.id,
          channelId: channel.id,
          chatId: channel.chatId,
          config: task.config as Record<string, unknown>,
          bot,
        };

        // Register event handlers (auto_reply, welcome, moderation)
        try {
          taskModule.onInit(taskCtx);
        } catch (err) {
          console.error(`❌ Task ${task.type}#${task.id} onInit failed:`, (err as Error).message);
        }

        // Register cron schedule (news_feed)
        if (task.schedule) {
          const jobId = `task-${task.id}`;
          try {
            scheduler.register(jobId, task.schedule, async () => {
              try {
                const result = await taskModule.onSchedule(taskCtx);
                const okCount = result.steps.filter((s) => s.status === 'ok').length;
                const errCount = result.steps.filter((s) => s.status === 'error').length;
                if (okCount > 0 || errCount > 0) {
                  console.log(`⏰ Task ${task.type}#${task.id}: ${okCount} ok, ${errCount} errors`);
                }
              } catch (err) {
                console.error(`❌ Cron task ${task.type}#${task.id} failed:`, (err as Error).message);
              }
            });
            cronJobIds.push(jobId);
          } catch (err) {
            console.error(`❌ Invalid cron "${task.schedule}" for task#${task.id}:`, (err as Error).message);
          }
        }
      }
    }

    // Register Telegram channel source listeners
    const allTaskIds = botChannels.flatMap((ch) =>
      db.select().from(tasks).where(eq(tasks.channelId, ch.id)).all().map((t) => t.id)
    );
    for (const taskId of allTaskIds) {
      const tgSources = db.select().from(sources)
        .where(eq(sources.taskId, taskId)).all()
        .filter((s) => s.type === 'telegram' && s.enabled);
      for (const src of tgSources) {
        registerTelegramSourceListener(bot, src.id, src.url);
        console.log(`📡 Listening to TG channel ${src.url} (source#${src.id})`);
      }
    }

    // Start polling (include chat_member for welcome/farewell)
    bot.start({
      allowed_updates: ['message', 'chat_member', 'channel_post', 'callback_query', 'inline_query', 'message_reaction'],
      onStart: () => console.log(`🟢 Bot @${me.username} started polling`),
    });

    this.running.set(botId, { botId, bot, username: me.username ?? '', cronJobIds });

    const taskCount = cronJobIds.length;
    console.log(`✅ Bot @${me.username} (id: ${botId}) running, ${taskCount} scheduled task(s)`);
  }

  async stopBot(botId: number) {
    const running = this.running.get(botId);
    if (!running) return;

    // Unregister all cron jobs for this bot
    for (const jobId of running.cronJobIds) {
      scheduler.unregister(jobId);
    }

    await running.bot.stop();
    this.running.delete(botId);

    db.update(bots)
      .set({ status: 'stopped', updatedAt: new Date().toISOString() })
      .where(eq(bots.id, botId))
      .run();

    console.log(`🔴 Bot @${running.username} stopped (${running.cronJobIds.length} cron jobs removed)`);
  }

  async restartBot(botId: number) {
    await this.stopBot(botId);
    await this.startBot(botId);
  }

  async shutdownAll() {
    console.log(`🔴 Shutting down ${this.running.size} bot(s)...`);
    const promises = Array.from(this.running.keys()).map((id) => this.stopBot(id));
    await Promise.allSettled(promises);
  }

  isRunning(botId: number): boolean {
    return this.running.has(botId);
  }

  getBotInstance(botId: number): Bot | null {
    return this.running.get(botId)?.bot ?? null;
  }

  get runningCount(): number {
    return this.running.size;
  }
}

export const botManager = new BotManager();
