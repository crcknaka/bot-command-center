ALTER TABLE `posts` ADD COLUMN `reactions` text DEFAULT '{}';
--> statement-breakpoint
ALTER TABLE `posts` ADD COLUMN `reaction_count` integer DEFAULT 0;
