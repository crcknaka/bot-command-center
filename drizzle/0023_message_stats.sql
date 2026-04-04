CREATE TABLE `message_stats` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `chat_id` text NOT NULL,
  `user_id` integer NOT NULL,
  `user_name` text,
  `username` text,
  `message_type` text NOT NULL,
  `text_length` integer DEFAULT 0,
  `created_at` text NOT NULL DEFAULT (datetime('now'))
);
