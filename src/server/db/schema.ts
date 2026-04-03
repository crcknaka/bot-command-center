import { sqliteTable, text, integer, unique } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ─── Users ───────────────────────────────────────────────────────────────────

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['superadmin', 'client'] }).notNull().default('client'),
  avatarUrl: text('avatar_url'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  lastLoginAt: text('last_login_at'),
});

// ─── Sessions ────────────────────────────────────────────────────────────────

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

// ─── Invites ─────────────────────────────────────────────────────────────────

export const invites = sqliteTable('invites', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  createdBy: integer('created_by').notNull().references(() => users.id),
  usedAt: text('used_at'),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

// ─── AI Providers (moved before bots — bots reference this) ─────────────────

export const aiProviders = sqliteTable('ai_providers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ownerId: integer('owner_id').references(() => users.id, { onDelete: 'cascade' }), // null = global
  name: text('name').notNull(),
  type: text('type', { enum: ['openai', 'anthropic', 'google', 'openrouter', 'ollama', 'lmstudio', 'custom'] }).notNull(),
  authType: text('auth_type', { enum: ['api_key', 'oauth'] }).notNull().default('api_key'),
  apiKey: text('api_key'),
  oauthToken: text('oauth_token'),
  oauthRefreshToken: text('oauth_refresh_token'),
  oauthExpiresAt: text('oauth_expires_at'),
  baseUrl: text('base_url'),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

// ─── Search Providers ────────────────────────────────────────────────────────

export const searchProviders = sqliteTable('search_providers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ownerId: integer('owner_id').references(() => users.id, { onDelete: 'cascade' }), // null = global
  name: text('name').notNull(),
  type: text('type', { enum: ['tavily', 'serper', 'serpapi', 'brave', 'google_cse'] }).notNull(),
  apiKey: text('api_key'),
  baseUrl: text('base_url'),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

// ─── Bots ────────────────────────────────────────────────────────────────────

export const bots = sqliteTable('bots', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ownerId: integer('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  name: text('name').notNull(),
  username: text('username'),
  status: text('status', { enum: ['active', 'stopped', 'error'] }).notNull().default('stopped'),
  errorMessage: text('error_message'),
  // Per-bot overrides (null = use owner's default or global)
  aiProviderId: integer('ai_provider_id').references(() => aiProviders.id, { onDelete: 'set null' }),
  searchProviderId: integer('search_provider_id').references(() => searchProviders.id, { onDelete: 'set null' }),
  systemPrompt: text('system_prompt'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

// ─── Channels ────────────────────────────────────────────────────────────────

export const channels = sqliteTable('channels', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  botId: integer('bot_id').notNull().references(() => bots.id, { onDelete: 'cascade' }),
  chatId: text('chat_id').notNull(),
  title: text('title').notNull(),
  type: text('type', { enum: ['channel', 'group', 'supergroup'] }).notNull().default('channel'),
  isTest: integer('is_test', { mode: 'boolean' }).notNull().default(false),
  isLinked: integer('is_linked', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

// ─── Tasks ───────────────────────────────────────────────────────────────────

export const tasks = sqliteTable('tasks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  channelId: integer('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  type: text('type', { enum: ['news_feed', 'auto_reply', 'welcome', 'moderation'] }).notNull(),
  config: text('config', { mode: 'json' }).notNull().default('{}'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  schedule: text('schedule'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

// ─── Sources (for news_feed tasks) ──────────────────────────────────────────

export const sources = sqliteTable('sources', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  taskId: integer('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  type: text('type', { enum: ['rss', 'reddit', 'youtube', 'twitter', 'web', 'tavily'] }).notNull(),
  url: text('url').notNull(),
  name: text('name').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  lastFetchedAt: text('last_fetched_at'),
  fetchIntervalMinutes: integer('fetch_interval_minutes').notNull().default(60),
});

// ─── Articles (raw fetched content) ─────────────────────────────────────────

export const articles = sqliteTable('articles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sourceId: integer('source_id').notNull().references(() => sources.id, { onDelete: 'cascade' }),
  externalId: text('external_id').notNull(),
  title: text('title').notNull(),
  summary: text('summary'),
  content: text('content'),
  url: text('url').notNull(),
  imageUrl: text('image_url'),
  author: text('author'),
  publishedAt: text('published_at'),
  fetchedAt: text('fetched_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  unique('uniq_source_external').on(table.sourceId, table.externalId),
]);

// ─── Posts (what gets sent to Telegram) ─────────────────────────────────────

export const posts = sqliteTable('posts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  channelId: integer('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  taskId: integer('task_id').references(() => tasks.id, { onDelete: 'set null' }),
  articleId: integer('article_id').references(() => articles.id, { onDelete: 'set null' }),
  content: text('content').notNull(),
  imageUrl: text('image_url'),
  status: text('status', { enum: ['draft', 'queued', 'publishing', 'published', 'failed'] }).notNull().default('draft'),
  scheduledFor: text('scheduled_for'),
  publishedAt: text('published_at'),
  telegramMessageId: integer('telegram_message_id'),
  aiProviderId: integer('ai_provider_id'),
  aiModel: text('ai_model'),
  errorMessage: text('error_message'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

// ─── Activity Log ───────────────────────────────────────────────────────────

export const activityLog = sqliteTable('activity_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  botId: integer('bot_id').references(() => bots.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  details: text('details', { mode: 'json' }),
  ipAddress: text('ip_address'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

// ─── Settings (key-value) ───────────────────────────────────────────────────

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});
