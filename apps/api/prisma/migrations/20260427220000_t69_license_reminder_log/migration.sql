-- T69: License Expiry Notifications — Reminder Log
-- Append-only side-table that records every reminder dispatched by the
-- expiry-watcher cron. The unique (subscriptionId, threshold) constraint
-- guarantees that each days-until-expiry band (30/14/7/3/1/0) fires at
-- most once per subscription, providing strong idempotency even if the
-- cron runs twice in the same window or is triggered manually.

CREATE TABLE "license_reminder_log" (
    "id" CHAR(26) NOT NULL DEFAULT gen_ulid(),
    "subscriptionId" CHAR(26) NOT NULL,
    "threshold" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "license_reminder_log_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "license_reminder_log_subscriptionId_threshold_key"
    ON "license_reminder_log"("subscriptionId", "threshold");

CREATE INDEX "license_reminder_log_subscriptionId_idx"
    ON "license_reminder_log"("subscriptionId");
