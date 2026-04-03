import type { TaskModule, TaskContext, TaskConfig, TaskRunLog, TaskRunStep } from '../types.js';
import { db } from '../../db/client.js';
import { sources, articles, posts, channels, bots } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { fetchAndStore } from './fetcher.js';
import { searchWeb } from '../../services/search.js';
import { generatePostFromSearch, generatePost } from '../../services/ai/generate.js';
import { resolveProvider, resolveModel } from '../../services/ai/provider.js';

interface NewsFeedConfig {
  useAi?: boolean; // true = AI rewrites, false = raw format from template
  rawTemplate?: string; // Template for non-AI mode: {title}, {summary}, {url}, {author}
  searchQueries?: string[];
  searchDepth?: 'basic' | 'advanced';
  maxResults?: number;
  timeRange?: 'day' | 'week' | 'month' | 'year';
  includeDomains?: string[];
  excludeDomains?: string[];
  aiProviderId?: number;
  aiModel?: string;
  systemPrompt?: string;
  postLanguage?: string;
  postMaxLength?: number;
  autoApprove?: boolean;
}

const DEFAULT_SYSTEM_PROMPT = `You are a professional Telegram channel editor. Create engaging, concise posts using HTML formatting (<b>, <i>, <a href="">). Include relevant emoji sparingly. Always include the source link at the end.`;

const DEFAULT_RAW_TEMPLATE = `<b>{title}</b>\n\n{summary}\n\n<a href="{url}">Читать далее</a>`;

/** Format article without AI — just fill template */
function formatRaw(article: { title: string; summary?: string | null; content?: string | null; url: string; author?: string | null }, template: string, maxLen: number): string {
  const summary = (article.summary || article.content || '').slice(0, maxLen);
  return template
    .replace(/\{title\}/g, article.title)
    .replace(/\{summary\}/g, summary)
    .replace(/\{content\}/g, article.content?.slice(0, maxLen) ?? '')
    .replace(/\{url\}/g, article.url)
    .replace(/\{author\}/g, article.author ?? '');
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

    if (taskSources.length === 0 && (!config.searchQueries || config.searchQueries.length === 0)) {
      steps.push({
        action: 'Проверка источников',
        status: 'error',
        detail: 'Нет ни RSS-источников, ни поисковых запросов. Добавьте хотя бы один источник или настройте поисковые запросы в конфиге задачи.',
      });
      return { steps };
    }

    for (const source of taskSources) {
      if (!source.enabled) {
        steps.push({ action: `Источник: ${source.name}`, status: 'skipped', detail: 'Отключён' });
        continue;
      }
      try {
        const count = await fetchAndStore(source.id);
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

    // ── Step 2: Tavily search ───────────────────────────────────────────
    if (config.searchQueries?.length) {
      for (const query of config.searchQueries) {
        try {
          const results = await searchWeb({
            query,
            maxResults: config.maxResults ?? 3,
            timeRange: config.timeRange ?? 'day',
            includeDomains: config.includeDomains,
            excludeDomains: config.excludeDomains,
            botId,
          });

          if (results.length === 0) {
            steps.push({ action: `Поиск: "${query}"`, status: 'skipped', detail: 'Ничего не найдено' });
            continue;
          }

          steps.push({ action: `Поиск: "${query}"`, status: 'ok', detail: `Найдено ${results.length} результатов` });

          // Generate post
          const provider = resolveProvider({
            taskConfigProviderId: config.aiProviderId,
            botId,
            ownerId,
          });

          if (!provider) {
            steps.push({ action: 'Генерация поста', status: 'error', detail: 'Не настроен AI-провайдер. Перейдите в «AI Модели» и добавьте API-ключ.' });
            continue;
          }

          const modelId = resolveModel(config.aiModel, provider.id);
          const systemPrompt = config.systemPrompt ?? bot?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;

          const generated = await generatePostFromSearch({
            providerId: provider.id,
            modelId,
            systemPrompt,
            searchResults: results,
            topic: query,
            language: lang,
            maxLength: maxLen,
          });

          db.insert(posts).values({
            channelId: ctx.channelId,
            taskId: ctx.taskId,
            content: generated.content,
            imageUrl: results[0]?.imageUrl,
            status: config.autoApprove ? 'queued' : 'draft',
            aiProviderId: provider.id,
            aiModel: modelId,
          }).run();

          steps.push({
            action: `Генерация: "${query}"`,
            status: 'ok',
            detail: `Пост создан (${generated.tokensUsed} токенов, модель: ${modelId}). Статус: ${config.autoApprove ? 'в очереди' : 'черновик'}.`,
          });
        } catch (err) {
          steps.push({ action: `Поиск: "${query}"`, status: 'error', detail: (err as Error).message });
        }
      }
    }

    // ── Step 3: Generate posts from unprocessed RSS articles ────────────
    if (taskSources.length > 0) {
      const allArticles = taskSources.flatMap((src) =>
        db.select().from(articles).where(eq(articles.sourceId, src.id)).all()
      );

      const unprocessed = allArticles.filter((article) => {
        const existingPost = db.select({ id: posts.id }).from(posts)
          .where(eq(posts.articleId, article.id)).limit(1).get();
        return !existingPost;
      }).slice(0, remainingToday);

      if (unprocessed.length === 0 && taskSources.length > 0) {
        steps.push({ action: 'Генерация из статей', status: 'skipped', detail: 'Нет новых необработанных статей' });
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
            const systemPrompt = config.systemPrompt ?? bot?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
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
