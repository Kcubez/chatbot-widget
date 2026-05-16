CREATE TABLE "morning_report_training" (
  "id" TEXT NOT NULL,
  "botId" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "morning_report_training_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "morning_report_submission" (
  "id" TEXT NOT NULL,
  "trainingId" TEXT NOT NULL,
  "reportDate" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "aiStatus" TEXT NOT NULL DEFAULT 'needs_review',
  "aiReason" TEXT,
  "aiFeedback" TEXT,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "morning_report_submission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "morning_report_training_memberId_key" ON "morning_report_training"("memberId");
CREATE INDEX "morning_report_training_botId_status_endsAt_idx" ON "morning_report_training"("botId", "status", "endsAt");
CREATE UNIQUE INDEX "morning_report_submission_trainingId_reportDate_key" ON "morning_report_submission"("trainingId", "reportDate");
CREATE INDEX "morning_report_submission_reportDate_aiStatus_idx" ON "morning_report_submission"("reportDate", "aiStatus");

ALTER TABLE "morning_report_training"
  ADD CONSTRAINT "morning_report_training_botId_fkey"
  FOREIGN KEY ("botId") REFERENCES "bot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "morning_report_training"
  ADD CONSTRAINT "morning_report_training_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "telegram_member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "morning_report_submission"
  ADD CONSTRAINT "morning_report_submission_trainingId_fkey"
  FOREIGN KEY ("trainingId") REFERENCES "morning_report_training"("id") ON DELETE CASCADE ON UPDATE CASCADE;
