-- Logistics: inventory items, fixed assets, checkout audit log

CREATE TYPE "AssetStatus" AS ENUM ('AVAILABLE', 'IN_USE', 'MAINTENANCE', 'LOST');

CREATE TABLE IF NOT EXISTS "InventoryItem" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sku" TEXT,
  "category" TEXT NOT NULL DEFAULT 'general',
  "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "minQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "unit" TEXT NOT NULL DEFAULT 'units',
  "location" TEXT,
  "organizationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Asset" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "serialNumber" TEXT,
  "type" TEXT NOT NULL DEFAULT 'tool',
  "status" "AssetStatus" NOT NULL DEFAULT 'AVAILABLE',
  "currentUserId" TEXT,
  "projectId" TEXT,
  "organizationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AssetCheckoutLog" (
  "id" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT,
  "projectId" TEXT,
  "action" TEXT NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssetCheckoutLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "InventoryItem_organizationId_idx" ON "InventoryItem"("organizationId");
CREATE INDEX IF NOT EXISTS "InventoryItem_organizationId_category_idx" ON "InventoryItem"("organizationId", "category");

CREATE UNIQUE INDEX IF NOT EXISTS "Asset_organizationId_serialNumber_key" ON "Asset"("organizationId", "serialNumber");
CREATE INDEX IF NOT EXISTS "Asset_organizationId_idx" ON "Asset"("organizationId");
CREATE INDEX IF NOT EXISTS "Asset_organizationId_status_idx" ON "Asset"("organizationId", "status");
CREATE INDEX IF NOT EXISTS "Asset_projectId_idx" ON "Asset"("projectId");
CREATE INDEX IF NOT EXISTS "Asset_currentUserId_idx" ON "Asset"("currentUserId");

CREATE INDEX IF NOT EXISTS "AssetCheckoutLog_assetId_createdAt_idx" ON "AssetCheckoutLog"("assetId", "createdAt");
CREATE INDEX IF NOT EXISTS "AssetCheckoutLog_organizationId_idx" ON "AssetCheckoutLog"("organizationId");

ALTER TABLE "InventoryItem"
  ADD CONSTRAINT "InventoryItem_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Asset"
  ADD CONSTRAINT "Asset_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Asset"
  ADD CONSTRAINT "Asset_currentUserId_fkey"
  FOREIGN KEY ("currentUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Asset"
  ADD CONSTRAINT "Asset_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AssetCheckoutLog"
  ADD CONSTRAINT "AssetCheckoutLog_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
