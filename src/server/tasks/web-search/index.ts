import type { TaskModule, TaskContext, TaskConfig, TaskRunLog, TaskRunStep } from '../types.js';
import { db } from '../../db/client.js';
import { posts, channels, bots } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { searchWeb } from '../../services/search.js';
import { generatePostFromSearch, generatePost } from '../../services/ai/generate.js';
import { resolveProvider, resolveModel } from '../../services/ai/provider.js';
import { resolvePostMode, type PostMode } from '../utils.js';
import { DEFAULT_SYSTEM_PROMPT } from '../prompts.js';

interface WebSearchConfig {
  queries: string[]; // Search queries
  useAi?: boolean; // true = AI rewrites, false = raw template
  rawTemplate?: string;
  aiProviderId?: number;
  aiModel?: string;
  systemPrompt?: string;
  postLanguage?: string;
  postMaxLength?: number;
  postMode?: PostMode; // queue (default) | draft | publish
  autoApprove?: boolean; // legacy, mapped to postMode
  maxResults?: number; // Max search results per query
  timeRange?: 'day' | 'week' | 'month' | 'year';
  searchLang?: string; // 'ru', 'en', etc.
  searchCountry?: string; // legacy single country
  searchCountries?: string[]; // ['ru', 'us'] — multiple countries
  includeDomains?: string[]; // only search these domains
}

const DEFAULT_RAW_TEMPLATE = `<b>{title}</b>\n\n{summary}\n\n🔗 <a href="{url}">Читать полностью</a>`;

/** Clean search snippet: remove duplicate titles, URLs, boilerplate */
function cleanSnippet(text: string, title: string): string {
  let clean = text;
  // Remove the title if it's repeated at the start
  if (clean.startsWith(title)) clean = clean.slice(title.length).replace(/^[\s.#\-–—|:]+/, '');
  // Remove URLs
  clean = clean.replace(/https?:\/\/\S+/g, '');
  // Remove common boilerplate patterns
  clean = clean.replace(/\b(Image \d+:|Going UP:|For non-personal use|please contact|Reprints at)\b.*$/gm, '');
  // Collapse whitespace
  clean = clean.replace(/\s{2,}/g, ' ').trim();
  // Take first 2-3 sentences (up to ~500 chars)
  const sentences = clean.match(/[^.!?]+[.!?]+/g) ?? [clean];
  let result = '';
  for (const s of sentences) {
    if (result.length + s.length > 500) break;
    result += s;
  }
  return result.trim() || clean.slice(0, 500);
}

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
          language: lang,
          searchLang: config.searchLang,
          searchCountry: config.searchCountry,
          searchCountries: config.searchCountries,
          includeDomains: config.includeDomains,
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

          const { status: postStatus, scheduledFor } = resolvePostMode(config, ctx.channelId, bot?.minPostIntervalMinutes);
          const inserted = db.insert(posts).values({
            channelId: ctx.channelId, taskId: ctx.taskId,
            content: generated.content, imageUrl: results[0]?.imageUrl,
            status: postStatus, scheduledFor,
            aiProviderId: provider.id, aiModel: modelId,
          }).returning().get();

          const modeLabel = postStatus === 'queued' ? 'в очереди' : 'черновик';
          steps.push({ action: `✍️ "${query}"`, status: 'ok', detail: `AI-пост создан (${generated.tokensUsed} токенов). Статус: ${modeLabel}.`, postId: inserted.id });
        } else {
          // Combine all results into one post per query
          const parts = results.map(sr => {
            const summary = cleanSnippet(sr.content ?? '', sr.title);
            if (!summary) return '';
            return rawTemplate
              .replace(/\{title\}/g, sr.title)
              .replace(/\{summary\}/g, summary)
              .replace(/\{content\}/g, summary)
              .replace(/\{url\}/g, sr.url)
              .replace(/\{author\}/g, '');
          }).filter(Boolean);

          if (parts.length > 0) {
            const content = parts.join('\n\n---\n\n');
            const { status: postStatus, scheduledFor } = resolvePostMode(config, ctx.channelId, bot?.minPostIntervalMinutes);
            const inserted = db.insert(posts).values({
              channelId: ctx.channelId, taskId: ctx.taskId,
              content, imageUrl: results[0]?.imageUrl,
              status: postStatus, scheduledFor,
            }).returning().get();

            const modeLabel = postStatus === 'queued' ? 'в очереди' : 'черновик';
            steps.push({ action: `📋 "${query}"`, status: 'ok', detail: `Пост из шаблона (${results.length} источников). Статус: ${modeLabel}.`, postId: inserted.id });
          }
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
