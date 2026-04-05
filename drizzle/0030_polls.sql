CREATE TABLE `polls` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `bot_id` integer NOT NULL REFERENCES `bots`(`id`) ON DELETE CASCADE,
  `channel_id` integer NOT NULL REFERENCES `channels`(`id`) ON DELETE CASCADE,
  `question` text NOT NULL,
  `options` text NOT NULL DEFAULT '[]',
  `type` text NOT NULL DEFAULT 'regular',
  `correct_option_id` integer,
  `explanation` text,
  `is_anonymous` integer NOT NULL DEFAULT 1,
  `allows_multiple_answers` integer NOT NULL DEFAULT 0,
  `telegram_message_id` integer,
  `status` text NOT NULL DEFAULT 'sent',
  `error_message` text,
  `created_at` text NOT NULL DEFAULT (datetime('now'))
);
