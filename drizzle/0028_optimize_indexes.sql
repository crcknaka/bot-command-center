CREATE INDEX IF NOT EXISTS `idx_msg_stats_thread` ON `message_stats` (`thread_id`);
CREATE INDEX IF NOT EXISTS `idx_posts_status_created` ON `posts` (`status`, `created_at`);
CREATE INDEX IF NOT EXISTS `idx_tasks_channel` ON `tasks` (`channel_id`);
CREATE INDEX IF NOT EXISTS `idx_sources_task` ON `sources` (`task_id`);
