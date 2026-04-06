/** Base system prompt — always included, sets formatting rules */
export const BASE_SYSTEM_PROMPT = `Ты — профессиональный редактор Telegram-канала. Пиши краткие, информативные посты на основе предоставленных источников.

Правила:
- Используй HTML-форматирование: <b>жирный</b>, <i>курсив</i>, <a href="URL">ссылка</a>
- Добавляй ссылку на источник в конце поста
- Пиши на том же языке что и источники
- НЕ выдумывай факты — используй только информацию из источников`;

/** Full system prompt = base + user's custom instructions */
export function buildSystemPrompt(userCustomPrompt?: string): string {
  if (!userCustomPrompt?.trim()) return BASE_SYSTEM_PROMPT;
  return `${BASE_SYSTEM_PROMPT}\n\nДополнительные инструкции от владельца канала:\n${userCustomPrompt.trim()}`;
}

/** Legacy export for backward compat */
export const DEFAULT_SYSTEM_PROMPT = BASE_SYSTEM_PROMPT;
