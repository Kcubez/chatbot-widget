ALTER TABLE "order"
  ADD COLUMN IF NOT EXISTS "paymentReceiptUrl" TEXT;
