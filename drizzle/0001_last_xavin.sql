ALTER TABLE `bots` ADD `ai_provider_id` integer REFERENCES ai_providers(id);--> statement-breakpoint
ALTER TABLE `bots` ADD `tavily_api_key` text;