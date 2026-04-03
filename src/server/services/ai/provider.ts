import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { db } from '../../db/client.js';
import { aiProviders, bots } from '../../db/schema.js';
import { eq, and, or, isNull } from 'drizzle-orm';
import type { LanguageModel } from 'ai';

type ProviderType = 'openai' | 'anthropic' | 'google' | 'openrouter' | 'ollama' | 'lmstudio' | 'custom';

/** Default base URLs for local providers */
const LOCAL_DEFAULTS: Record<string, string> = {
  ollama: 'http://localhost:11434/v1',
  lmstudio: 'http://localhost:1234/v1',
};

/**
 * Create an AI SDK language model from a provider record.
 * Local providers (Ollama, LM Studio) use OpenAI-compatible API.
 */
export function createModelFromProvider(providerId: number, modelId: string): LanguageModel {
  const provider = db.select().from(aiProviders).where(eq(aiProviders.id, providerId)).limit(1).get();
  if (!provider) throw new Error(`AI-провайдер #${providerId} не найден`);
  if (!provider.enabled) throw new Error(`AI-провайдер "${provider.name}" отключён`);

  const apiKey = provider.apiKey || 'not-needed';
  const baseURL = provider.baseUrl || LOCAL_DEFAULTS[provider.type] || undefined;

  switch (provider.type as ProviderType) {
    case 'openai': {
      const openai = createOpenAI({ apiKey, baseURL });
      return openai(modelId);
    }
    case 'anthropic': {
      const anthropic = createAnthropic({ apiKey, baseURL });
      return anthropic(modelId);
    }
    case 'google': {
      const google = createGoogleGenerativeAI({ apiKey, baseURL });
      return google(modelId);
    }
    case 'openrouter': {
      const key = provider.oauthToken ?? apiKey;
      const openrouter = createOpenRouter({ apiKey: key });
      return openrouter(modelId);
    }
    case 'ollama':
    case 'lmstudio':
    case 'custom': {
      // All use OpenAI-compatible API
      const local = createOpenAI({ apiKey, baseURL });
      return local(modelId);
    }
    default:
      throw new Error(`Неизвестный тип провайдера: ${provider.type}`);
  }
}

/**
 * Resolve AI provider with priority chain:
 *   1. Task config (explicit aiProviderId)
 *   2. Bot-level (bot.aiProviderId)
 *   3. Owner's default (aiProviders where ownerId = bot owner, isDefault)
 *   4. Global default (aiProviders where ownerId = null, isDefault)
 *   5. Any enabled provider
 */
export function resolveProvider(opts: {
  taskConfigProviderId?: number;
  botId?: number;
  ownerId?: number;
}) {
  // 1. Explicit from task config
  if (opts.taskConfigProviderId) {
    const p = db.select().from(aiProviders).where(eq(aiProviders.id, opts.taskConfigProviderId)).limit(1).get();
    if (p?.enabled) return p;
  }

  // 2. Bot-level
  if (opts.botId) {
    const bot = db.select().from(bots).where(eq(bots.id, opts.botId)).limit(1).get();
    if (bot?.aiProviderId) {
      const p = db.select().from(aiProviders).where(eq(aiProviders.id, bot.aiProviderId)).limit(1).get();
      if (p?.enabled) return p;
    }
  }

  // 3. Owner's default
  if (opts.ownerId) {
    const p = db.select().from(aiProviders)
      .where(and(eq(aiProviders.ownerId, opts.ownerId), eq(aiProviders.isDefault, true), eq(aiProviders.enabled, true)))
      .limit(1).get();
    if (p) return p;
  }

  // 4. Global default
  const globalDefault = db.select().from(aiProviders)
    .where(and(isNull(aiProviders.ownerId), eq(aiProviders.isDefault, true), eq(aiProviders.enabled, true)))
    .limit(1).get();
  if (globalDefault) return globalDefault;

  // 5. Any enabled
  return db.select().from(aiProviders).where(eq(aiProviders.enabled, true)).limit(1).get();
}

/** Default model name per provider type */
const DEFAULT_MODELS: Record<string, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-20250514',
  google: 'gemini-2.5-flash',
  openrouter: 'openai/gpt-4o',
  ollama: 'llama3.1',
  lmstudio: 'loaded-model',
  custom: 'gpt-4o',
};

/**
 * Resolve model: use config override, or pick default for provider type.
 */
export function resolveModel(configModel: string | undefined, providerId: number): string {
  if (configModel) return configModel;

  const provider = db.select().from(aiProviders).where(eq(aiProviders.id, providerId)).limit(1).get();
  if (!provider) return 'gpt-4o';

  return DEFAULT_MODELS[provider.type] ?? 'gpt-4o';
}

// Keep backward compat
export function getDefaultProvider(ownerId?: number) {
  return resolveProvider({ ownerId });
}
