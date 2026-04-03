CREATE TABLE IF NOT EXISTS `search_providers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_id` integer REFERENCES `users`(`id`) ON DELETE cascade,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`api_key` text,
	`base_url` text,
	`is_default` integer DEFAULT false NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
