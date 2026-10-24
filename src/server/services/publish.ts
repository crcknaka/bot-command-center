import { InputFile } from 'grammy';
import { db } from '../db/client.js';
import { posts, channels, bots } from '../db/schema.js';
import { and, eq, inArray } from 'drizzle-orm';
import { botManager } from '../bot/manager.js';
import { logActivity } from './activity.js';
import { sanitizeForTelegram, visibleLength, MESSAGE_LIMIT, CAPTION_LIMIT } from './telegram-html.js';
import { uploadPath } from './uploads.js';

type Post = typeof posts.$inferSelect;

export class PublishError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409 | 500 = 500) {
    super(message);
  }
}

/**
 * Take a post for sending. Only one caller can win: the status flips to 'publishing'
 * in a single UPDATE, so a double click or the cron racing a manual publish
 * cannot send the same post twice.
 */
export function claimPost(id: number): Post | null {
  return db.update(posts)
    .set({ status: 'publishing', updatedAt: new Date().toISOString() })
    .where(and(eq(posts.id, id), inArray(posts.status, ['draft', 'queued', 'failed'])))
    .returning().get() ?? null;
}

function buildContent(text: string, signature: string | null | undefined): string {
  let content = sanitizeForTelegram(text);
  if (signature) content += '\n\n' + signature;
  return content;
}

function buildKeyboard(post: Post) {
  const buttons = post.inlineButtons as Array<{ text: string; url: string }> | null;
  return buttons?.length ? { inline_keyboard: [buttons.map((b) => ({ text: b.text, url: b.url }))] } : undefined;
}

type Channel = typeof channels.$inferSelect;

/**
 * Send ready HTML with an optional image to a channel or topic.
 * Returns the id of the message that carries the text.
 */
async function sendToChannel(api: any, channel: Channel, content: string, imageUrl: string | null, replyMarkup: unknown, label: string): Promise<number> {
  const length = visibleLength(content);
  const sendOpts: any = {
    parse_mode: 'HTML' as const,
    message_thread_id: channel.threadId ?? undefined,
    reply_markup: replyMarkup,
  };
  const sendText = async (extra: Record<string, unknown> = {}) =>
    (await api.sendMessage(channel.chatId, content, { ...sendOpts, ...extra })).message_id;

  const localFile = uploadPath(imageUrl);
  if (!imageUrl) return sendText();
  if (length <= CAPTION_LIMIT) {
    try {
      const photo = localFile ? new InputFile(localFile) : imageUrl;
      return (await api.sendPhoto(channel.chatId, photo, { caption: content, ...sendOpts })).message_id;
    } catch (photoErr) {
      // Broken image URL: the text still goes out
      console.error(`[publish] sendPhoto failed for ${label}, sending as text: ${(photoErr as Error).message}`);
      return sendText();
    }
  }
  if (localFile) {
    // Too long for a caption and the image is not reachable by URL: photo first, text right after
    await api.sendPhoto(channel.chatId, new InputFile(localFile), { message_thread_id: channel.threadId ?? undefined });
    return sendText();
  }
  // Too long for a caption: one message with the image as a large preview above the text
  return sendText({ link_preview_options: { url: imageUrl, prefer_large_media: true, show_above_text: true } });
}

/**
 * Send a post exactly as it would go out — signature included — without saving it anywhere.
 * Used to check a post in the test chat before publishing it for real.
 */
export async function sendTestMessage(channelId: number, text: string, imageUrl?: string | null): Promise<number> {
  const channel = db.select().from(channels).where(eq(channels.id, channelId)).limit(1).get();
  if (!channel) throw new PublishError('Тестовый чат не найден', 404);
  const botInstance = botManager.getBotInstance(channel.botId);
  if (!botInstance) throw new PublishError('Бот не запущен', 400);
  const bot = db.select().from(bots).where(eq(bots.id, channel.botId)).limit(1).get();

  const content = buildContent(text, bot?.postSignature);
  const length = visibleLength(content);
  if (length > MESSAGE_LIMIT) throw new PublishError(`Текст длиннее ${MESSAGE_LIMIT} символов (${length}) — Telegram его не примет`, 400);
  try {
    return await sendToChannel(botInstance.api, channel, content, imageUrl ?? null, undefined, 'test message');
  } catch (err) {
    throw new PublishError((err as Error).message);
  }
}

/**
 * Send a post that was claimed with claimPost(). Records the result on the post
 * (published / failed) and rethrows on failure.
 */
export async function sendClaimedPost(post: Post, opts: { userId?: number } = {}): Promise<number> {
  const fail = (message: string, status: 400 | 404 | 500 = 500): never => {
    db.update(posts).set({ status: 'failed', errorMessage: message, updatedAt: new Date().toISOString() }).where(eq(posts.id, post.id)).run();
    throw new PublishError(message, status);
  };

  const channel = db.select().from(channels).where(eq(channels.id, post.channelId)).limit(1).get();
  if (!channel) return fail('Канал не найден', 404);
  const botInstance = botManager.getBotInstance(channel.botId);
  if (!botInstance) return fail('Бот не запущен', 400);
  const bot = db.select().from(bots).where(eq(bots.id, channel.botId)).limit(1).get();

  const content = buildContent(post.content, bot?.postSignature);
  const length = visibleLength(content);
  if (length > MESSAGE_LIMIT) return fail(`Текст длиннее ${MESSAGE_LIMIT} символов (${length}) — Telegram его не примет`, 400);

  let messageId: number;
  try {
    messageId = await sendToChannel(botInstance.api, channel, content, post.imageUrl, buildKeyboard(post), `post #${post.id}`);
  } catch (err) {
    const message = (err as Error).message;
    logActivity({ userId: opts.userId, botId: channel.botId, action: 'post.failed', details: { postId: post.id, channelTitle: channel.title, error: message } });
    console.error(`❌ Failed to publish post #${post.id}:`, message);
    return fail(message);
  }

  const now = new Date().toISOString();
  const deleteAt = bot?.autoDeleteHours && bot.autoDeleteHours > 0
    ? new Date(Date.now() + bot.autoDeleteHours * 3600 * 1000).toISOString()
    : null;
  db.update(posts)
    .set({ status: 'published', publishedAt: now, telegramMessageId: messageId, deleteAt, errorMessage: null, updatedAt: now })
    .where(eq(posts.id, post.id)).run();

  if (bot?.autoPin) {
    try { await botInstance.api.pinChatMessage(channel.chatId, messageId); } catch (e) {
      console.error(`[publish] Failed to pin post #${post.id}:`, e);
    }
  }

  logActivity({ userId: opts.userId, botId: channel.botId, action: 'post.published', details: { postId: post.id, channelTitle: channel.title } });
  console.log(`📨 Published post #${post.id} to channel ${channel.title}`);
  return messageId;
}

/** Publish a post right now (manual publish from the UI) */
export async function publishPostNow(id: number, userId?: number): Promise<number> {
  const existing = db.select().from(posts).where(eq(posts.id, id)).limit(1).get();
  if (!existing) throw new PublishError('Пост не найден', 404);
  if (existing.status === 'published') throw new PublishError('Пост уже опубликован', 400);

  // Checked before claiming so a stopped bot does not turn a draft into a failed post
  const channel = db.select().from(channels).where(eq(channels.id, existing.channelId)).limit(1).get();
  if (!channel) throw new PublishError('Канал не найден', 404);
  if (!botManager.getBotInstance(channel.botId)) throw new PublishError('Бот не запущен', 400);

  const post = claimPost(id);
  if (!post) throw new PublishError('Пост уже отправляется', 409);
  return sendClaimedPost(post, { userId });
}

function publishedTarget(post: Post) {
  if (post.status !== 'published' || !post.telegramMessageId) throw new PublishError('Пост не опубликован в Telegram', 400);
  const channel = db.select().from(channels).where(eq(channels.id, post.channelId)).limit(1).get();
  if (!channel) throw new PublishError('Канал не найден', 404);
  const botInstance = botManager.getBotInstance(channel.botId);
  if (!botInstance) throw new PublishError('Бот не запущен', 400);
  const bot = db.select().from(bots).where(eq(bots.id, channel.botId)).limit(1).get();
  return { channel, botInstance, bot, messageId: post.telegramMessageId };
}

/** Change the text of a post that is already in the channel */
export async function editPublishedPost(post: Post, newContent: string, userId?: number): Promise<void> {
  const { channel, botInstance, bot, messageId } = publishedTarget(post);
  const content = buildContent(newContent, bot?.postSignature);
  const length = visibleLength(content);
  const opts: any = { parse_mode: 'HTML' as const, reply_markup: buildKeyboard(post) };

  // A post sent as a photo carries its text as a caption; the post row does not record which one it was
  const asCaption = () => botInstance.api.editMessageCaption(channel.chatId, messageId, { caption: content, ...opts });
  const asText = () => botInstance.api.editMessageText(channel.chatId, messageId, content, opts);
  const captionFirst = !!post.imageUrl && visibleLength(buildContent(post.content, bot?.postSignature)) <= CAPTION_LIMIT;

  try {
    if (captionFirst) {
      if (length > CAPTION_LIMIT) throw new PublishError(`Подпись к фото не может быть длиннее ${CAPTION_LIMIT} символов (сейчас ${length})`, 400);
      try { await asCaption(); } catch (e) {
        if (!/no caption|there is no/i.test((e as Error).message)) throw e;
        await asText();
      }
    } else {
      if (length > MESSAGE_LIMIT) throw new PublishError(`Текст длиннее ${MESSAGE_LIMIT} символов (${length})`, 400);
      try { await asText(); } catch (e) {
        if (!/no text/i.test((e as Error).message)) throw e;
        await asCaption();
      }
    }
  } catch (err) {
    if (err instanceof PublishError) throw err;
    throw new PublishError((err as Error).message);
  }

  db.update(posts).set({ content: newContent, updatedAt: new Date().toISOString() }).where(eq(posts.id, post.id)).run();
  logActivity({ userId, botId: channel.botId, action: 'post.edited', details: { postId: post.id, channelTitle: channel.title } });
}

/** Remove a published post from the channel (the post row is left to the caller) */
export async function deletePublishedMessage(post: Post, userId?: number): Promise<void> {
  const { channel, botInstance, messageId } = publishedTarget(post);
  try {
    await botInstance.api.deleteMessage(channel.chatId, messageId);
  } catch (err) {
    // Already gone from the chat is as good as deleted
    if (!/message to delete not found/i.test((err as Error).message)) throw new PublishError((err as Error).message);
  }
  logActivity({ userId, botId: channel.botId, action: 'post.unpublished', details: { postId: post.id, channelTitle: channel.title } });
}
