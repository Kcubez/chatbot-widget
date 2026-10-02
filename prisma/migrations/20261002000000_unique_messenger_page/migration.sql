-- Fail without changing connections if existing pages are assigned more than once.
-- Resolve duplicates explicitly before deploying this migration.
CREATE UNIQUE INDEX "bot_messengerPageId_key" ON "bot"("messengerPageId");
