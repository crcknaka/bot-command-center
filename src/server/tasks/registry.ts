import type { TaskModule } from './types.js';
import { NewsFeedTask } from './news-feed/index.js';
import { AutoReplyTask } from './auto-reply/index.js';
import { WelcomeTask } from './welcome/index.js';
import { ModerationTask } from './moderation/index.js';

const modules: Record<string, TaskModule> = {
  news_feed: new NewsFeedTask(),
  auto_reply: new AutoReplyTask(),
  welcome: new WelcomeTask(),
  moderation: new ModerationTask(),
};

export function getTaskModule(type: string): TaskModule {
  const mod = modules[type];
  if (!mod) throw new Error(`Unknown task type: ${type}`);
  return mod;
}

export function getAvailableTaskTypes(): string[] {
  return Object.keys(modules);
}
