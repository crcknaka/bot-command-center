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
      content: result.text,
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
    }),
    prompt: `Пользователь хочет настроить автоматический поиск новостей и генерацию постов для Telegram-канала.

Вот что он написал:
"${options.userPrompt}"

Сгенерируй конфигурацию:
1. queries — 3-5 поисковых запросов для Google. Делай их конкретными. Если тема связана с конкретной страной, добавляй название страны в часть запросов. Запросы на том языке, на котором больше контента по теме.
2. searchCountries — коды стран откуда искать. Если пользователь упомянул регион (Прибалтика = lv, lt, ee).
3. searchLang — язык РЕЗУЛЬТАТОВ (не страны). Если пользователь хочет русскоязычный контент — "ru", даже если ищет в Латвии.
4. systemPrompt — инструкция для AI-редактора который будет писать пост. Включи стиль, тон, язык поста, что важно для аудитории канала.
5. timeRange — "day" для новостей, "week" для обзоров, "month" для исследований.
6. maxResults — обычно 3-5, больше если тема узкая.`,
    maxRetries: 1,
  });

  return result.object;
}
