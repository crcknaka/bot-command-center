ALTER TABLE `bots` ADD `search_provider_id` integer REFERENCES `search_providers`(`id`) ON DELETE set null;
