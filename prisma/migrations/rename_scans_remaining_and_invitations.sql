-- שינוי שמות עמודות סריקה + isVip + טבלת הזמנות (אחרי סביבות עם cheapScansLeft הישן)

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Organization' AND column_name = 'cheapScansLeft'
  ) THEN
    ALTER TABLE "Organization" RENAME COLUMN "cheapScansLeft" TO "cheapScansRemaining";
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Organization' AND column_name = 'premiumScansLeft'
  ) THEN
    ALTER TABLE "Organization" RENAME COLUMN "premiumScansLeft" TO "premiumScansRemaining";
  END IF;
END $$;

ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "isVip" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "SubscriptionInvitation" (
  "id" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "subscriptionTier" "SubscriptionTier" NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdByEmail" TEXT,
  CONSTRAINT "SubscriptionInvitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SubscriptionInvitation_token_key" ON "SubscriptionInvitation"("token");
CREATE INDEX IF NOT EXISTS "SubscriptionInvitation_email_idx" ON "SubscriptionInvitation"("email");
CREATE INDEX IF NOT EXISTS "SubscriptionInvitation_expiresAt_idx" ON "SubscriptionInvitation"("expiresAt");
