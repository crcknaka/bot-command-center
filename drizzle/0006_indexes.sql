CREATE INDEX IF NOT EXISTS idx_posts_channel_status ON posts(channel_id, status);
CREATE INDEX IF NOT EXISTS idx_posts_scheduled ON posts(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_channels_bot ON channels(bot_id);
CREATE INDEX IF NOT EXISTS idx_articles_source ON articles(source_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at);
