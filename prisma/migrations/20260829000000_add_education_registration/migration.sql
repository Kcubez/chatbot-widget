CREATE TABLE "education_registration" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "messengerSenderId" TEXT NOT NULL,
    "classType" TEXT,
    "learningMode" TEXT,
    "township" TEXT,
    "status" TEXT NOT NULL DEFAULT 'collecting_preference',
    "scheduleText" TEXT,
    "adminNote" TEXT,
    "handedOffAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "education_registration_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "education_registration_botId_status_updatedAt_idx"
  ON "education_registration"("botId", "status", "updatedAt");
CREATE INDEX "education_registration_botId_messengerSenderId_idx"
  ON "education_registration"("botId", "messengerSenderId");

ALTER TABLE "education_registration"
  ADD CONSTRAINT "education_registration_botId_fkey"
  FOREIGN KEY ("botId") REFERENCES "bot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
