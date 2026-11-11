-- Добавочная миграция: данные не меняются
ALTER TABLE "feed_links" ADD COLUMN "last_sync_error" TEXT;
ALTER TABLE "feed_links" ADD COLUMN "media_mode" TEXT NOT NULL DEFAULT 'remote';
