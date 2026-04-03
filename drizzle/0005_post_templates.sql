CREATE TABLE IF NOT EXISTS `post_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_id` integer REFERENCES `users`(`id`) ON DELETE cascade,
	`name` text NOT NULL,
	`description` text,
	`content` text NOT NULL,
	`system_prompt` text,
	`category` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
