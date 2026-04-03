import { generateText } from 'ai';
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
      maxOutputTokens: options.maxTokens ?? 1000,
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

  const userPrompt = `Topic: ${options.topic}
Language: ${options.language ?? 'Russian'}
Max length: ${options.maxLength ?? 500} characters

Sources:
${sourcesText}

Create an engaging Telegram post based on these sources. Use HTML formatting (<b>, <i>, <a href="">).`;

  return generatePost({
    providerId: options.providerId,
    modelId: options.modelId,
    systemPrompt: options.systemPrompt,
    userPrompt,
    maxTokens: 1000,
  });
}
