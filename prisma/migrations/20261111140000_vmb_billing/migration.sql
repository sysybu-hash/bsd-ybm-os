-- VisualModuBuild offices, subscriptions, credit ledger and payments.
-- Additive only; no reference to the platform's tables.
CREATE TABLE IF NOT EXISTS "VmbWorkspace" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "engineOrgId" TEXT,
    CONSTRAINT "VmbWorkspace_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "VmbMembership" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    CONSTRAINT "VmbMembership_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "VmbMembership_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "VmbWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VmbMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "VmbUser"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "VmbSubscription" (
    "workspaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "plan" TEXT NOT NULL DEFAULT 'office',
    "status" TEXT NOT NULL DEFAULT 'active',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "includedCredits" INTEGER NOT NULL,
    CONSTRAINT "VmbSubscription_pkey" PRIMARY KEY ("workspaceId"),
    CONSTRAINT "VmbSubscription_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "VmbWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "VmbCreditLedger" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspaceId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "jobId" TEXT,
    "note" TEXT,
    CONSTRAINT "VmbCreditLedger_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "VmbCreditLedger_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "VmbWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "VmbPayment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspaceId" TEXT NOT NULL,
    "gateway" TEXT NOT NULL,
    "txId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "packId" TEXT,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ILS',
    "status" TEXT NOT NULL DEFAULT 'completed',
    CONSTRAINT "VmbPayment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "VmbPayment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "VmbWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Not CONCURRENTLY: migrate deploy runs inside a transaction, and the tables are new and empty.
CREATE UNIQUE INDEX IF NOT EXISTS "VmbWorkspace_engineOrgId_key" ON "VmbWorkspace"("engineOrgId");
CREATE UNIQUE INDEX IF NOT EXISTS "VmbMembership_workspaceId_userId_key" ON "VmbMembership"("workspaceId", "userId");
CREATE INDEX IF NOT EXISTS "VmbMembership_userId_idx" ON "VmbMembership"("userId");
CREATE INDEX IF NOT EXISTS "VmbSubscription_status_periodEnd_idx" ON "VmbSubscription"("status", "periodEnd");
CREATE UNIQUE INDEX IF NOT EXISTS "VmbCreditLedger_workspaceId_reason_refId_key" ON "VmbCreditLedger"("workspaceId", "reason", "refId");
CREATE INDEX IF NOT EXISTS "VmbCreditLedger_workspaceId_createdAt_idx" ON "VmbCreditLedger"("workspaceId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "VmbPayment_gateway_txId_key" ON "VmbPayment"("gateway", "txId");
CREATE INDEX IF NOT EXISTS "VmbPayment_workspaceId_createdAt_idx" ON "VmbPayment"("workspaceId", "createdAt");
