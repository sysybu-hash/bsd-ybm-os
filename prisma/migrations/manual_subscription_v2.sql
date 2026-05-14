-- מיגרציה ידנית: plan/credits -> subscriptionTier + סריקות זולות/פרימיום
-- בטוח להרצה פעם אחת על DB שעדיין עם העמודות הישנות.

DO $$
BEGIN
  CREATE TYPE "SubscriptionTier" AS ENUM ('FREE', 'HOUSEHOLD', 'DEALER', 'COMPANY', 'CORPORATE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Organization'
      AND column_name = 'plan'
  ) THEN
    ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "subscriptionTier" "SubscriptionTier";
    ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "cheapScansLeft" INTEGER;
    ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "premiumScansLeft" INTEGER;
    ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "maxCompanies" INTEGER;

    UPDATE "Organization"
    SET
      "subscriptionTier" = (
        CASE UPPER(TRIM(COALESCE("plan", 'FREE')))
          WHEN 'PRO' THEN 'HOUSEHOLD'::"SubscriptionTier"
          WHEN 'BUSINESS' THEN 'COMPANY'::"SubscriptionTier"
          WHEN 'ENTERPRISE' THEN 'CORPORATE'::"SubscriptionTier"
          WHEN 'HOUSEHOLD' THEN 'HOUSEHOLD'::"SubscriptionTier"
          WHEN 'DEALER' THEN 'DEALER'::"SubscriptionTier"
          WHEN 'COMPANY' THEN 'COMPANY'::"SubscriptionTier"
          WHEN 'CORPORATE' THEN 'CORPORATE'::"SubscriptionTier"
          WHEN 'FREE' THEN 'FREE'::"SubscriptionTier"
          ELSE 'FREE'::"SubscriptionTier"
        END
      ),
      "cheapScansLeft" = COALESCE("creditsRemaining", 0),
      "premiumScansLeft" = 0,
      "maxCompanies" = 1;

    UPDATE "Organization"
    SET "maxCompanies" = CASE "subscriptionTier"
      WHEN 'COMPANY' THEN 2
      WHEN 'CORPORATE' THEN 99
      ELSE 1
    END;

    UPDATE "Organization" SET "subscriptionTier" = 'FREE'::"SubscriptionTier" WHERE "subscriptionTier" IS NULL;
    UPDATE "Organization" SET "cheapScansLeft" = 0 WHERE "cheapScansLeft" IS NULL;
    UPDATE "Organization" SET "premiumScansLeft" = 0 WHERE "premiumScansLeft" IS NULL;
    UPDATE "Organization" SET "maxCompanies" = 1 WHERE "maxCompanies" IS NULL;

    ALTER TABLE "Organization" ALTER COLUMN "subscriptionTier" SET DEFAULT 'FREE'::"SubscriptionTier";
    ALTER TABLE "Organization" ALTER COLUMN "subscriptionTier" SET NOT NULL;
    ALTER TABLE "Organization" ALTER COLUMN "cheapScansLeft" SET DEFAULT 0;
    ALTER TABLE "Organization" ALTER COLUMN "cheapScansLeft" SET NOT NULL;
    ALTER TABLE "Organization" ALTER COLUMN "premiumScansLeft" SET DEFAULT 0;
    ALTER TABLE "Organization" ALTER COLUMN "premiumScansLeft" SET NOT NULL;
    ALTER TABLE "Organization" ALTER COLUMN "maxCompanies" SET DEFAULT 1;
    ALTER TABLE "Organization" ALTER COLUMN "maxCompanies" SET NOT NULL;

    ALTER TABLE "Organization" DROP COLUMN IF EXISTS "plan";
    ALTER TABLE "Organization" DROP COLUMN IF EXISTS "creditsRemaining";
    ALTER TABLE "Organization" DROP COLUMN IF EXISTS "monthlyAllowance";
    ALTER TABLE "Organization" DROP COLUMN IF EXISTS "isPayAsYouGo";
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "PlatformBillingConfig" (
  "id" TEXT NOT NULL,
  CONSTRAINT "PlatformBillingConfig_pkey" PRIMARY KEY ("id"),
  "tierMonthlyPricesJson" JSONB,
  "paypalClientIdPublic" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "ScanBundle" (
  "id" TEXT NOT NULL,
  CONSTRAINT "ScanBundle_pkey" PRIMARY KEY ("id"),
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "priceIls" DOUBLE PRECISION NOT NULL,
  "cheapAdds" INTEGER NOT NULL DEFAULT 0,
  "premiumAdds" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "ScanBundle_slug_key" ON "ScanBundle"("slug");
CREATE INDEX IF NOT EXISTS "ScanBundle_isActive_sortOrder_idx" ON "ScanBundle"("isActive", "sortOrder");
