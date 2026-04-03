import { Bot } from 'grammy';
import { db } from '../db/client.js';
import { bots } from '../db/schema.js';
import { eq } from 'drizzle-orm';

interface RunningBot {
  botId: number;
  bot: Bot;
  username: string;
}

class BotManager {
  private running = new Map<number, RunningBot>();

  /** Start all bots marked 'active' in DB */
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

  /** Start a single bot by ID */
  async startBot(botId: number) {
    if (this.running.has(botId)) {
      console.log(`⚠️  Bot ${botId} is already running`);
      return;
    }

    const botRecord = db.select().from(bots).where(eq(bots.id, botId)).limit(1).get();
    if (!botRecord) throw new Error(`Bot ${botId} not found`);

    const bot = new Bot(botRecord.token);

    // Validate token
    const me = await bot.api.getMe();

    // Update DB
    db.update(bots)
      .set({ username: me.username, status: 'active', errorMessage: null, updatedAt: new Date().toISOString() })
      .where(eq(bots.id, botId))
      .run();

    // Setup basic handlers
    bot.command('start', (ctx) => {
      ctx.reply(`👋 I'm ${me.first_name}, managed by Bot Command Center.`);
    });

    bot.command('status', (ctx) => {
      ctx.reply('✅ Online and operational.');
    });

    // Error handler
    bot.catch((err) => {
      console.error(`❌ Bot @${me.username} error:`, err.message);
    });

    // Start polling (non-blocking)
    bot.start({
      onStart: () => console.log(`🟢 Bot @${me.username} started polling`),
    });

    this.running.set(botId, { botId, bot, username: me.username ?? '' });
    console.log(`✅ Bot @${me.username} (id: ${botId}) is running`);
  }

  /** Stop a single bot */
  async stopBot(botId: number) {
    const running = this.running.get(botId);
    if (!running) return;

    await running.bot.stop();
    this.running.delete(botId);

    db.update(bots)
      .set({ status: 'stopped', updatedAt: new Date().toISOString() })
      .where(eq(bots.id, botId))
      .run();

    console.log(`🔴 Bot @${running.username} stopped`);
  }

  /** Restart a bot (stop + start) */
  async restartBot(botId: number) {
    await this.stopBot(botId);
    await this.startBot(botId);
  }

  /** Graceful shutdown of all bots */
  async shutdownAll() {
    console.log(`🔴 Shutting down ${this.running.size} bot(s)...`);
    const promises = Array.from(this.running.keys()).map((id) => this.stopBot(id));
    await Promise.allSettled(promises);
  }

  /** Get running status */
  isRunning(botId: number): boolean {
    return this.running.has(botId);
  }

  /** Get bot instance for API calls (e.g., publishing) */
  getBotInstance(botId: number): Bot | null {
    return this.running.get(botId)?.bot ?? null;
  }

  /** Get count of running bots */
  get runningCount(): number {
    return this.running.size;
  }
}

export const botManager = new BotManager();
