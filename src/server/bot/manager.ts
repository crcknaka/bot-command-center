import { Bot } from 'grammy';
import { db } from '../db/client.js';
import { bots, channels, tasks } from '../db/schema.js';
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

  async startAll() {
    const activeBots = db.select().from(bots).where(eq(bots.status, 'active')).all();
    for (const botRecord of activeBots) {
      try {
        await this.startBot(botRecord.id);
      } catch (err) {
        console.error(`❌ Failed to start bot ${botRecord.name}:`, (err as Error).message);
      }
    }
  }

  async startBot(botId: number) {
    if (this.running.has(botId)) {
      console.log(`⚠️  Bot ${botId} is already running`);
      return;
    }

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

    // Start polling
    bot.start({
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
