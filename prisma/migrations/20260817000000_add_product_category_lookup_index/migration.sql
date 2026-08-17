-- Improve Messenger product category browsing lookups.
CREATE INDEX IF NOT EXISTS "product_bot_active_type_category_idx"
ON "product" ("botId", "isActive", "productType", "category");
