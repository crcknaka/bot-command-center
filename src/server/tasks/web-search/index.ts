import type { TaskModule, TaskContext, TaskConfig, TaskRunLog, TaskRunStep } from '../types.js';
import { db } from '../../db/client.js';
import { posts, channels, bots } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { searchWeb } from '../../services/search.js';
import { generatePostFromSearch, generatePost } from '../../services/ai/generate.js';
import { resolveProvider, resolveModel } from '../../services/ai/provider.js';

interface WebSearchConfig {
  queries: string[]; // Search queries
  useAi?: boolean; // true = AI rewrites, false = raw template
  rawTemplate?: string;
  aiProviderId?: number;
  aiModel?: string;
  systemPrompt?: string;
  postLanguage?: string;
  postMaxLength?: number;
  autoApprove?: boolean;
  maxResults?: number; // Max search results per query
  timeRange?: 'day' | 'week' | 'month' | 'year';
}

const DEFAULT_SYSTEM_PROMPT = `You are a professional Telegram channel editor. Create engaging, concise posts using HTML formatting (<b>, <i>, <a href="">). Include relevant emoji sparingly. Always include the source link at the end.`;

const DEFAULT_RAW_TEMPLATE = `<b>{title}</b>\n\n{summary}\n\n<a href="{url}">Источник</a>`;

export class WebSearchTask implements TaskModule {
  readonly type = 'web_search';

  onInit(_ctx: TaskContext): void {}

  async onSchedule(ctx: TaskContext): Promise<TaskRunLog> {
    const config = ctx.config as unknown as WebSearchConfig;
    const steps: TaskRunStep[] = [];

    if (!config.queries?.length) {
      steps.push({ action: 'Проверка', status: 'error', detail: 'Не заданы поисковые запросы.' });
      return { steps };
    }

    const channel = db.select().from(channels).where(eq(channels.id, ctx.channelId)).limit(1).get();
    const bot = channel ? db.select().from(bots).where(eq(bots.id, channel.botId)).limit(1).get() : null;
    const botId = bot?.id;
    const ownerId = bot?.ownerId;
    const lang = config.postLanguage ?? bot?.postLanguage ?? 'Russian';
    const maxLen = config.postMaxLength ?? bot?.maxPostLength ?? 2000;
    const maxPerDay = bot?.maxPostsPerDay ?? 5;
    const useAi = config.useAi !== false;
    const rawTemplate = config.rawTemplate ?? DEFAULT_RAW_TEMPLATE;

    // Check daily limit
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const postsToday = db.select().from(posts)
      .where(eq(posts.channelId, ctx.channelId)).all()
      .filter((p) => p.createdAt >= todayStart.toISOString()).length;

    if (postsToday >= maxPerDay) {
      steps.push({ action: 'Лимит', status: 'skipped', detail: `Достигнут лимит ${maxPerDay} постов в день.` });
      return { steps };
    }

    for (const query of config.queries) {
      try {
        const results = await searchWeb({
          query,
          maxResults: config.maxResults ?? 3,
          timeRange: config.timeRange ?? 'day',
          botId,
        });

        if (results.length === 0) {
          steps.push({ action: `🔍 "${query}"`, status: 'skipped', detail: 'Ничего не найдено' });
          continue;
        }

        steps.push({ action: `🔍 "${query}"`, status: 'ok', detail: `Найдено ${results.length} результатов` });

        if (useAi) {
          const provider = resolveProvider({ taskConfigProviderId: config.aiProviderId, botId, ownerId });
          if (!provider) {
            steps.push({ action: 'AI генерация', status: 'error', detail: 'AI-провайдер не настроен. Добавьте в Настройки → AI-модели, или переключите на «Без AI».' });
            continue;
          }

          const modelId = resolveModel(config.aiModel, provider.id);
          const systemPrompt = config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;

          const generated = await generatePostFromSearch({
            providerId: provider.id, modelId, systemPrompt,
            searchResults: results, topic: query, language: lang, maxLength: maxLen,
          });

          db.insert(posts).values({
            channelId: ctx.channelId, taskId: ctx.taskId,
            content: generated.content, imageUrl: results[0]?.imageUrl,
            status: config.autoApprove ? 'approved' : 'draft',
            aiProviderId: provider.id, aiModel: modelId,
          }).run();

          steps.push({ action: `✍️ "${query}"`, status: 'ok', detail: `AI-пост создан (${generated.tokensUsed} токенов). Статус: ${config.autoApprove ? 'одобрен' : 'черновик'}.` });
        } else {
          for (const sr of results) {
            const content = rawTemplate
              .replace(/\{title\}/g, sr.title)
              .replace(/\{summary\}/g, sr.content?.slice(0, maxLen) ?? '')
              .replace(/\{content\}/g, sr.content?.slice(0, maxLen) ?? '')
              .replace(/\{url\}/g, sr.url)
              .replace(/\{author\}/g, '');

            db.insert(posts).values({
              channelId: ctx.channelId, taskId: ctx.taskId,
              content, imageUrl: sr.imageUrl,
              status: config.autoApprove ? 'approved' : 'draft',
            }).run();
          }

          steps.push({ action: `📋 "${query}"`, status: 'ok', detail: `${results.length} постов из шаблона. Статус: ${config.autoApprove ? 'одобрен' : 'черновик'}.` });
        }
      } catch (err) {
        steps.push({ action: `🔍 "${query}"`, status: 'error', detail: (err as Error).message });
      }
    }

    return { steps };
  }

  getConfigSchema() {
    return {
      type: 'object',
      properties: {
        queries: { type: 'array', items: { type: 'string' } },
        useAi: { type: 'boolean' },
        aiProviderId: { type: 'number' },
        aiModel: { type: 'string' },
        systemPrompt: { type: 'string' },
        postLanguage: { type: 'string' },
        postMaxLength: { type: 'number' },
        autoApprove: { type: 'boolean' },
        maxResults: { type: 'number' },
        timeRange: { type: 'string' },
      },
    };
  }

  validateConfig(config: TaskConfig): void {
    const c = config as unknown as WebSearchConfig;
    if (!c.queries?.length) throw new Error('Нужен хотя бы один поисковый запрос');
  }
}
