-- VMB costs (admin): fixed monthly vendor costs the owner enters, the rates that turn measured usage into money,
-- a log of every administrator action, and how many DWGs a job converted.
CREATE TABLE IF NOT EXISTS "VmbFixedCost" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "vendor" TEXT NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'ILS',
  "startsOn" TIMESTAMP(3) NOT NULL,
  "endsOn" TIMESTAMP(3),
  "note" TEXT,
  CONSTRAINT "VmbFixedCost_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "VmbFixedCost_startsOn_idx" ON "VmbFixedCost"("startsOn");

CREATE TABLE IF NOT EXISTS "VmbCostRate" (
  "key" TEXT NOT NULL,
  "value" DOUBLE PRECISION NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedBy" TEXT,
  CONSTRAINT "VmbCostRate_pkey" PRIMARY KEY ("key")
);

CREATE TABLE IF NOT EXISTS "VmbAdminLog" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "adminEmail" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "workspaceId" TEXT,
  "ok" BOOLEAN NOT NULL DEFAULT true,
  "detail" JSONB,
  CONSTRAINT "VmbAdminLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "VmbAdminLog_createdAt_idx" ON "VmbAdminLog"("createdAt");

ALTER TABLE "VmbJob" ADD COLUMN IF NOT EXISTS "dwgConversions" INTEGER NOT NULL DEFAULT 0;
