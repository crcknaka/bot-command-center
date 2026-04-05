import { Hono } from 'hono';
import { db } from '../db/client.js';
import { polls, pollVotes, channels, bots } from '../db/schema.js';
import { eq, desc, and, inArray } from 'drizzle-orm';
import { requireAuth } from '../auth/middleware.js';
import { botManager } from '../bot/manager.js';
import { logActivity } from '../services/activity.js';

const pollsApi = new Hono();
pollsApi.use('*', requireAuth);

/** Get bot IDs owned by user */
function getUserBotIds(user: any): number[] {
  if (user.role === 'superadmin') return db.select({ id: bots.id }).from(bots).all().map(b => b.id);
  return db.select({ id: bots.id }).from(bots).where(eq(bots.ownerId, user.id)).all().map(b => b.id);
}

// GET /api/polls — list polls with filters
pollsApi.get('/', async (c) => {
  const user = (c as any).get('user');
  const botId = c.req.query('botId');
  const type = c.req.query('type');
  const limit = Number(c.req.query('limit') || '50');

  const botIds = getUserBotIds(user);
  if (botIds.length === 0) return c.json([]);

  let rows = db.select().from(polls)
    .where(inArray(polls.botId, botIds))
    .orderBy(desc(polls.createdAt))
    .limit(limit)
    .all();

  if (botId) rows = rows.filter(p => p.botId === Number(botId));
  if (type === 'regular' || type === 'quiz') rows = rows.filter(p => p.type === type);

  // Enrich with channel/bot names
  const allChannels = db.select().from(channels).all();
  const allBots = db.select().from(bots).all();
  const channelMap: Record<number, string> = {};
  const botMap: Record<number, string> = {};
  allChannels.forEach(ch => channelMap[ch.id] = ch.title);
  allBots.forEach(b => botMap[b.id] = b.name);

  return c.json(rows.map(p => ({
    ...p,
    channelTitle: channelMap[p.channelId] ?? '',
    botName: botMap[p.botId] ?? '',
  })));
});

// POST /api/polls — create and send a poll
pollsApi.post('/', async (c) => {
  const user = (c as any).get('user');
  const body = await c.req.json<{
    botId: number;
    channelId: number;
    question: string;
    options: string[];
    type?: 'regular' | 'quiz';
    correctOptionId?: number;
    explanation?: string;
    isAnonymous?: boolean;
    allowsMultipleAnswers?: boolean;
  }>();

  if (!body.question?.trim()) return c.json({ error: 'Вопрос обязателен' }, 400);
  const cleanOptions = (body.options ?? []).filter(o => o.trim());
  if (cleanOptions.length < 2) return c.json({ error: 'Минимум 2 варианта ответа' }, 400);
  if (cleanOptions.length > 10) return c.json({ error: 'Максимум 10 вариантов' }, 400);
  if (body.type === 'quiz' && (body.correctOptionId == null || body.correctOptionId < 0 || body.correctOptionId >= cleanOptions.length)) {
    return c.json({ error: 'Для квиза нужно указать правильный ответ' }, 400);
  }

  // Check access
  const botIds = getUserBotIds(user);
  if (!botIds.includes(body.botId)) return c.json({ error: 'Forbidden' }, 403);

  const botInstance = botManager.getBotInstance(body.botId);
  if (!botInstance) return c.json({ error: 'Бот не запущен' }, 400);

  const channel = db.select().from(channels).where(eq(channels.id, body.channelId)).limit(1).get();
  if (!channel) return c.json({ error: 'Канал не найден' }, 404);

  // Save to DB first
  const pollRecord = db.insert(polls).values({
    botId: body.botId,
    channelId: body.channelId,
    question: body.question,
    options: cleanOptions as any,
    type: body.type ?? 'regular',
    correctOptionId: body.correctOptionId ?? null,
    explanation: body.explanation ?? null,
    isAnonymous: body.isAnonymous ?? true,
    allowsMultipleAnswers: body.allowsMultipleAnswers ?? false,
    status: 'sent',
  }).returning().get();

  try {
    const msg = await botInstance.api.sendPoll(channel.chatId, body.question, cleanOptions, {
      is_anonymous: body.isAnonymous ?? true,
      allows_multiple_answers: body.allowsMultipleAnswers ?? false,
      type: body.type ?? 'regular',
      correct_option_id: body.type === 'quiz' ? body.correctOptionId : undefined,
      explanation: body.type === 'quiz' && body.explanation ? body.explanation : undefined,
      message_thread_id: channel.threadId ?? undefined,
    } as any);

    const tgPollId = (msg as any).poll?.id ?? null;
    db.update(polls).set({ telegramMessageId: msg.message_id, telegramPollId: tgPollId }).where(eq(polls.id, pollRecord.id)).run();
    logActivity({ userId: user.id, botId: body.botId, action: 'bot.poll_sent', details: { channelTitle: channel.title, question: body.question, type: body.type ?? 'regular' } });

    return c.json({ ...pollRecord, telegramMessageId: msg.message_id }, 201);
  } catch (err) {
    db.update(polls).set({ status: 'failed', errorMessage: (err as Error).message }).where(eq(polls.id, pollRecord.id)).run();
    return c.json({ error: (err as Error).message }, 500);
  }
});

// DELETE /api/polls/:id
pollsApi.delete('/:id', async (c) => {
  const user = (c as any).get('user');
  const id = Number(c.req.param('id'));
  const poll = db.select().from(polls).where(eq(polls.id, id)).limit(1).get();
  if (!poll) return c.json({ error: 'Not found' }, 404);
  const botIds = getUserBotIds(user);
  if (!botIds.includes(poll.botId)) return c.json({ error: 'Forbidden' }, 403);
  db.delete(polls).where(eq(polls.id, id)).run();
  return c.json({ ok: true });
});

// GET /api/polls/:id/votes — individual votes (non-anonymous polls)
pollsApi.get('/:id/votes', async (c) => {
  const user = (c as any).get('user');
  const id = Number(c.req.param('id'));
  const poll = db.select().from(polls).where(eq(polls.id, id)).limit(1).get();
  if (!poll) return c.json({ error: 'Not found' }, 404);
  const botIds = getUserBotIds(user);
  if (!botIds.includes(poll.botId)) return c.json({ error: 'Forbidden' }, 403);

  const votes = db.select().from(pollVotes).where(eq(pollVotes.pollId, id)).all();
  return c.json(votes);
});

export { pollsApi };
