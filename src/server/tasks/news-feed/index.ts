import type { TaskModule, TaskContext, TaskConfig, TaskRunLog, TaskRunStep } from '../types.js';
import { db } from '../../db/client.js';
import { sources, articles, posts, channels, bots } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { fetchAndStore } from './fetcher.js';
import { generatePost } from '../../services/ai/generate.js';
import { resolveProvider, resolveModel } from '../../services/ai/provider.js';

interface NewsFeedConfig {
  useAi?: boolean; // true = AI rewrites, false = raw format from template
  rawTemplate?: string; // Template for non-AI mode: {title}, {summary}, {url}, {author}
  filterKeywords?: string[]; // Only process articles containing these keywords
  maxAgeDays?: number; // Skip articles older than N days (default 7)
  aiProviderId?: number;
  aiModel?: string;
  systemPrompt?: string;
  postLanguage?: string;
  postMaxLength?: number;
  autoApprove?: boolean;
}

const DEFAULT_SYSTEM_PROMPT = `You are a professional Telegram channel editor. Create engaging, concise posts using HTML formatting (<b>, <i>, <a href="">). Include relevant emoji sparingly. Always include the source link at the end.`;

const DEFAULT_RAW_TEMPLATE = `<b>{title}</b>\n\n{summary}\n\n<a href="{url}">Читать далее</a> · {author}`;

/** Format article without AI — just fill template */
function formatRaw(article: { title: string; summary?: string | null; content?: string | null; url: string; author?: string | null }, template: string, maxLen: number): string {
  let summary = (article.summary || article.content || '').slice(0, maxLen);
  // Don't duplicate: if summary is same as title (or nearly), clear it
  if (summary.trim().toLowerCase().startsWith(article.title.trim().toLowerCase().slice(0, 30))) {
    summary = '';
  }
  // Clean up: strip HTML tags from summary for raw mode
  summary = summary.replace(/<[^>]+>/g, '').trim();

  let result = template
    .replace(/\{title\}/g, article.title)
    .replace(/\{summary\}/g, summary)
    .replace(/\{content\}/g, (article.content ?? '').replace(/<[^>]+>/g, '').slice(0, maxLen))
    .replace(/\{url\}/g, article.url)
    .replace(/\{author\}/g, article.author ?? '');

  // Clean up empty lines from empty placeholders
  result = result.replace(/\n{3,}/g, '\n\n').trim();
  return result;
}

export class NewsFeedTask implements TaskModule {
  readonly type = 'news_feed';

  onInit(_ctx: TaskContext): void {}

  async onSchedule(ctx: TaskContext): Promise<TaskRunLog> {
    const config = ctx.config as NewsFeedConfig;
    const steps: TaskRunStep[] = [];

    // Resolve bot context for API key chain
    const channel = db.select().from(channels).where(eq(channels.id, ctx.channelId)).limit(1).get();
    const bot = channel ? db.select().from(bots).where(eq(bots.id, channel.botId)).limit(1).get() : null;
    const botId = bot?.id;
    const ownerId = bot?.ownerId;
    const lang = config.postLanguage ?? bot?.postLanguage ?? 'Russian';
    const maxLen = config.postMaxLength ?? bot?.maxPostLength ?? 2000;
    const maxPerDay = bot?.maxPostsPerDay ?? 5;
    const useAi = config.useAi !== false; // default true for backward compat
    const rawTemplate = config.rawTemplate ?? DEFAULT_RAW_TEMPLATE;

    // Check daily limit
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const postsToday = db.select().from(posts)
      .where(eq(posts.channelId, ctx.channelId)).all()
      .filter((p) => p.createdAt >= todayStart.toISOString()).length;

    if (postsToday >= maxPerDay) {
      steps.push({ action: 'Лимит', status: 'skipped', detail: `Достигнут лимит ${maxPerDay} постов в день (создано: ${postsToday}). Пропускаю генерацию.` });
      return { steps };
    }
    const remainingToday = maxPerDay - postsToday;

    // ── Step 1: Fetch from RSS sources ──────────────────────────────────
    const taskSources = db.select().from(sources).where(eq(sources.taskId, ctx.taskId)).all();

    if (taskSources.length === 0) {
      steps.push({
        action: 'Проверка источников',
        status: 'error',
        detail: 'Нет источников. Добавьте хотя бы один RSS-фид, Reddit, Twitter или другой источник.',
      });
      return { steps };
    }

    for (const source of taskSources) {
      if (!source.enabled) {
        steps.push({ action: `Источник: ${source.name}`, status: 'skipped', detail: 'Отключён' });
        continue;
      }
      try {
        const count = await fetchAndStore(source.id, config.maxAgeDays ?? 7);
        steps.push({
          action: `Источник: ${source.name}`,
          status: 'ok',
          detail: count > 0 ? `Найдено ${count} новых статей` : 'Новых статей нет',
        });
      } catch (err) {
        steps.push({
          action: `Источник: ${source.name}`,
          status: 'error',
          detail: `Ошибка: ${(err as Error).message}`,
        });
      }
    }

    // ── Step 2: Generate posts from unprocessed RSS articles ────────────
    if (taskSources.length > 0) {
      const allArticles = taskSources.flatMap((src) =>
        db.select().from(articles).where(eq(articles.sourceId, src.id)).all()
      );

      // Filter by keywords if configured
      const keywords = config.filterKeywords?.filter(k => k.trim()) ?? [];
      const filtered = keywords.length > 0
        ? allArticles.filter((article) => {
            const text = `${article.title} ${article.summary ?? ''} ${article.content ?? ''}`.toLowerCase();
            return keywords.some(kw => text.includes(kw.toLowerCase()));
          })
        : allArticles;

      if (keywords.length > 0) {
        if (filtered.length === 0) {
          steps.push({ action: 'Фильтр', status: 'skipped', detail: `Ни одна из ${allArticles.length} статей не содержит: ${keywords.join(', ')}. Попробуйте расширить ключевые слова.` });
        } else {
          steps.push({ action: 'Фильтр', status: 'ok', detail: `${filtered.length} из ${allArticles.length} статей содержат: ${keywords.join(', ')}` });
        }
      }

      const unprocessed = filtered.filter((article) => {
        const existingPost = db.select({ id: posts.id }).from(posts)
          .where(eq(posts.articleId, article.id)).limit(1).get();
        return !existingPost;
      }).slice(0, remainingToday);

      if (unprocessed.length === 0) {
        steps.push({ action: 'Посты', status: 'skipped', detail: keywords.length > 0 ? 'Все подходящие статьи уже обработаны.' : 'Нет новых статей для обработки.' });
      }

      for (const article of unprocessed) {
        try {
          let content: string;
          let aiModel: string | undefined;
          let aiPid: number | undefined;
          let tokensUsed = 0;

          if (useAi) {
            // AI mode — rewrite article into post
            const provider = resolveProvider({ taskConfigProviderId: config.aiProviderId, botId, ownerId });
            if (!provider) {
              steps.push({ action: 'Генерация', status: 'error', detail: 'Режим «С AI» включён, но AI-провайдер не настроен. Добавьте в Настройки → AI-модели, или переключите задачу на «Без AI».' });
              break;
            }
            const modelId = resolveModel(config.aiModel, provider.id);
            const systemPrompt = config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
            const generated = await generatePost({
              providerId: provider.id, modelId, systemPrompt,
              userPrompt: `Create a Telegram post based on this article:\n\nTitle: ${article.title}\nContent: ${article.content ?? article.summary ?? ''}\nURL: ${article.url}\n\nLanguage: ${lang}\nMax length: ${maxLen} characters`,
            });
            content = generated.content;
            aiModel = modelId;
            aiPid = provider.id;
            tokensUsed = generated.tokensUsed;
          } else {
            // Raw mode — just format from template
            content = formatRaw(article, rawTemplate, maxLen);
          }

          db.insert(posts).values({
            channelId: ctx.channelId,
            taskId: ctx.taskId,
            articleId: article.id,
            content,
            imageUrl: article.imageUrl,
            status: config.autoApprove ? 'queued' : 'draft',
            aiProviderId: aiPid,
            aiModel,
          }).run();

          steps.push({
            action: `Статья: "${article.title.slice(0, 50)}..."`,
            status: 'ok',
            detail: useAi
              ? `AI-пост (${tokensUsed} токенов, ${aiModel}). Статус: ${config.autoApprove ? 'в очереди' : 'черновик'}.`
              : `Пост из шаблона (без AI). Статус: ${config.autoApprove ? 'в очереди' : 'черновик'}.`,
          });
        } catch (err) {
          const errMsg = (err as Error).message;
          steps.push({ action: `Статья: "${article.title.slice(0, 50)}..."`, status: 'error', detail: errMsg });
          // Stop on quota/rate limit errors — no point trying more
          if (errMsg.includes('Лимит') || errMsg.includes('quota') || errMsg.includes('rate')) {
            steps.push({ action: 'Остановка', status: 'skipped', detail: 'Лимит API исчерпан — остальные статьи пропущены.' });
            break;
          }
        }
      }
    }

    if (steps.length === 0) {
      steps.push({ action: 'Результат', status: 'skipped', detail: 'Нечего делать — нет источников и поисковых запросов.' });
    }

    return { steps };
  }

  getConfigSchema(): Record<string, unknown> {
    return {
      type: 'object',
      properties: {
        searchQueries: { type: 'array', items: { type: 'string' } },
        aiProviderId: { type: 'number' },
        aiModel: { type: 'string', default: 'gpt-4o' },
        systemPrompt: { type: 'string' },
        postLanguage: { type: 'string', default: 'Russian' },
        postMaxLength: { type: 'number', default: 500 },
        autoApprove: { type: 'boolean', default: false },
      },
    };
  }

  validateConfig(_config: TaskConfig): void {}
}
