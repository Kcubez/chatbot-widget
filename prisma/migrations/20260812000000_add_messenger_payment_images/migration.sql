ALTER TABLE "bot"
  ADD COLUMN "messengerPaymentImages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "bot"
  ADD COLUMN "messengerPaymentReviewMessage" TEXT;
