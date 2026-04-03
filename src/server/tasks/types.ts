import type { Bot } from 'grammy';

export interface TaskConfig {
  [key: string]: unknown;
}

export interface TaskContext {
  taskId: number;
  channelId: number;
  chatId: string;
  config: TaskConfig;
  bot: Bot;
}

export interface TaskRunLog {
  steps: TaskRunStep[];
}

export interface TaskRunStep {
  action: string;
  status: 'ok' | 'error' | 'skipped';
  detail: string;
}

export interface TaskModule {
  readonly type: string;
  onInit(ctx: TaskContext): void;
  onSchedule(ctx: TaskContext): Promise<TaskRunLog>;
  getConfigSchema(): Record<string, unknown>;
  validateConfig(config: TaskConfig): void;
}
