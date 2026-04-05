ALTER TABLE `polls` ADD COLUMN `telegram_poll_id` text;
--> statement-breakpoint
ALTER TABLE `polls` ADD COLUMN `total_voters` integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `polls` ADD COLUMN `results` text DEFAULT '[]';
--> statement-breakpoint
ALTER TABLE `polls` ADD COLUMN `last_results_at` text;
--> statement-breakpoint
CREATE TABLE `poll_votes` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `poll_id` integer NOT NULL REFERENCES `polls`(`id`) ON DELETE CASCADE,
  `user_id` integer NOT NULL,
  `user_name` text,
  `username` text,
  `option_ids` text NOT NULL DEFAULT '[]',
  `created_at` text NOT NULL DEFAULT (datetime('now'))
);
