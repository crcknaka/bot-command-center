import { generateText, generateObject } from 'ai';
import { z } from 'zod';
import { createModelFromProvider } from './provider.js';

export interface GeneratePostOptions {
  providerId: number;
  modelId: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
}

export interface GeneratePostResult {
  content: string;
  model: string;
  tokensUsed: number;
}

/**
 * If AI output was truncated mid-word/sentence, trim to the last complete sentence.
 * Preserves HTML tags.
 */
function trimToCompleteSentence(text: string): string {
  if (!text) return text;
  const trimmed = text.trimEnd();

  // Check if text ends "naturally" — with punctuation, closing tag, emoji, or link
  if (/[.!?…»")\]>]\s*(<\/[a-z]+>)*\s*$/.test(trimmed)) return trimmed;
  if (trimmed.endsWith('</a>') || trimmed.endsWith('</b>') || trimmed.endsWith('</i>')) return trimmed;

  // Text is likely truncated — find the last sentence boundary
  // Strip trailing HTML tags to find the raw text boundary
  const withoutTrailingTags = trimmed.replace(/(<\/[a-z]+>\s*)+$/, '');
  const lastSentenceEnd = Math.max(
    withoutTrailingTags.lastIndexOf('. '),
    withoutTrailingTags.lastIndexOf('! '),
    withoutTrailingTags.lastIndexOf('? '),
    withoutTrailingTags.lastIndexOf('.\n'),
    withoutTrailingTags.lastIndexOf('!\n'),
    withoutTrailingTags.lastIndexOf('?\n'),
  );

  if (lastSentenceEnd > trimmed.length * 0.5) {
    // Cut at last sentence, keep the punctuation
    let result = trimmed.slice(0, lastSentenceEnd + 1);
    // Close any unclosed HTML tags
    const openTags = (result.match(/<(b|i|u|s|a)[^>]*>/g) ?? []).map(t => t.match(/<(\w+)/)?.[1]);
    const closeTags = (result.match(/<\/(b|i|u|s|a)>/g) ?? []).map(t => t.match(/<\/(\w+)>/)?.[1]);
    for (const tag of openTags.reverse()) {
      if (tag && !closeTags.includes(tag)) result += `</${tag}>`;
    }
    return result;
  }

  // Can't find good cut point — return as-is with trailing incomplete word removed
  const lastSpace = trimmed.lastIndexOf(' ');
  if (lastSpace > trimmed.length * 0.8) {
    return trimmed.slice(0, lastSpace).replace(/[,;:\-–—]\s*$/, '').trimEnd() + '...';
  }

  return trimmed;
}

/**
 * Generate a Telegram post using the specified AI model.
 */
export async function generatePost(options: GeneratePostOptions): Promise<GeneratePostResult> {
  const model = createModelFromProvider(options.providerId, options.modelId);

  try {
    const result = await generateText({
      model,
      system: options.systemPrompt,
      prompt: options.userPrompt,
      maxOutputTokens: options.maxTokens ?? 2000,
      maxRetries: 1, // Don't retry on quota errors
    });

    return {
      content: trimToCompleteSentence(result.text),
      model: options.modelId,
      tokensUsed: (result.usage?.totalTokens) ?? 0,
    };
  } catch (err) {
    const msg = (err as Error).message;
    // Make error messages more user-friendly
    if (msg.includes('quota') || msg.includes('rate') || msg.includes('limit')) {
      throw new Error(`Лимит API исчерпан (${options.modelId}). Подождите или смените провайдера.`);
    }
    if (msg.includes('not found') || msg.includes('not supported')) {
      throw new Error(`Модель ${options.modelId} не найдена. Проверьте настройки AI-провайдера.`);
    }
    if (msg.includes('API key') || msg.includes('authentication') || msg.includes('401')) {
      throw new Error(`Неверный API-ключ для ${options.modelId}. Проверьте в Настройки → AI-модели.`);
    }
    throw err;
  }
}

/**
 * Generate a post from search results.
 * Takes Tavily search results and creates a Telegram-formatted post.
 */
export async function generatePostFromSearch(options: {
  providerId: number;
  modelId: string;
  systemPrompt: string;
  searchResults: Array<{ title: string; content: string; url: string }>;
  topic: string;
  language?: string;
  maxLength?: number;
}): Promise<GeneratePostResult> {
  const sourcesText = options.searchResults
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.content}\nURL: ${r.url}`)
    .join('\n\n');

  const lang = options.language ?? 'Russian';
  const maxLen = options.maxLength ?? 1500;

  const userPrompt = `Напиши пост для Telegram-канала на основе этих источников.

Тема: ${options.topic}
Язык: ${lang}
Максимум ${maxLen} символов.

Источники:
${sourcesText}

Сохрани ключевые факты. Добавь ссылки на источники.`;

  return generatePost({
    providerId: options.providerId,
    modelId: options.modelId,
    systemPrompt: options.systemPrompt,
    userPrompt,
    maxTokens: Math.max(2000, maxLen * 2),
  });
}

/**
 * AI-powered task setup: user describes what they want in natural language,
 * AI generates the full task configuration.
 */
export async function generateTaskConfig(options: {
  providerId: number;
  modelId: string;
  userPrompt: string;
}): Promise<{
  queries: string[];
  searchCountries: string[];
  searchLang: string;
  systemPrompt: string;
  timeRange: string;
  maxResults: number;
  maxPostsPerDay: number;
  postIntervalMinutes: number;
  postMaxLength: number;
  schedule: string;
}> {
  const model = createModelFromProvider(options.providerId, options.modelId);

  const result = await generateObject({
    model,
    schema: z.object({
      queries: z.array(z.string()).describe('3-5 поисковых запросов для Google, короткие и конкретные, на языке который даст лучшие результаты'),
      searchCountries: z.array(z.string()).describe('ISO коды стран для поиска: ru, us, lv, lt, ee, de, ua, gb, fr, es, kz, by, il'),
      searchLang: z.string().describe('Код языка результатов: ru, en, lv, uk, de, fr, es'),
      systemPrompt: z.string().describe('Промпт для AI который будет писать пост из найденных статей — стиль, тон, что включать, на каком языке писать'),
      timeRange: z.enum(['day', 'week', 'month']).describe('Как свежие нужны результаты'),
      maxResults: z.number().min(1).max(10).describe('Сколько источников искать на каждый запрос'),
      maxPostsPerDay: z.number().min(1).max(20).describe('Сколько постов в день максимум создавать'),
      postIntervalMinutes: z.number().min(5).max(1440).describe('Минимальный интервал в минутах между публикациями постов'),
      postMaxLength: z.number().min(300).max(4000).describe('Максимальная длина поста в символах'),
      schedule: z.string().describe('Cron-выражение для расписания запуска задачи. Примеры: "0 9 * * *" (каждый день в 9:00), "0 9,18 * * *" (дважды в день), "0 */3 * * *" (каждые 3 часа)'),
    }),
    prompt: `Пользователь хочет настроить автоматический поиск новостей и генерацию постов для Telegram-канала.

Вот что он написал:
"${options.userPrompt}"

Сгенерируй конфигурацию:
1. queries — 3-5 поисковых запросов для Google. Делай их конкретными. Если тема связана с конкретной страной, добавляй название страны в часть запросов. Запросы на том языке, на котором больше контента по теме.
2. searchCountries — коды стран откуда искать. Если пользователь упомянул регион (Прибалтика = lv, lt, ee).
3. searchLang — язык РЕЗУЛЬТАТОВ (не страны). Если пользователь хочет русскоязычный контент — "ru", даже если ищет в Латвии.
4. systemPrompt — инструкция для AI-редактора который будет писать пост. Включи стиль, тон, язык поста, что важно для аудитории канала.
5. timeRange — "day" для ежедневных новостей, "week" для еженедельных обзоров, "month" для исследований.
6. maxResults — обычно 3-5 источников на запрос, больше если тема узкая.
7. maxPostsPerDay — сколько постов в день. Для новостного канала 3-5, для нишевого 1-2.
8. postIntervalMinutes — интервал между публикациями. 60 мин для частых, 120-180 для редких.
9. postMaxLength — длина поста. 800-1200 для коротких, 1500-2500 для подробных.
10. schedule — cron-выражение. "0 9 * * *" для раз в день утром, "0 9,14,19 * * *" для 3 раз в день, "0 */4 * * *" для каждые 4 часа. Частота должна соответствовать теме.`,
    maxRetries: 1,
  });

  return result.object;
}
