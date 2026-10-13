-- 0070: Index the two hottest unindexed tables.
--
-- chat_messages: every chat load, fork, and message delete filters by
-- chat_id and orders by (created_at, id) -- previously a sequential scan
-- on the fastest-growing table in the app, on every chat open.
-- usage_events: usage aggregation (spend windows, daily rollups, admin
-- detail) always filters by user and scans by recency.
CREATE INDEX "chat_messages_chat_id_created_at_idx" ON "chat_messages" ("chat_id", "created_at", "id");
CREATE INDEX "usage_events_user_id_created_at_idx" ON "usage_events" ("user_id", "created_at");
