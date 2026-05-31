-- CustomAppSchema + CustomAppData — AI App Builder

CREATE TABLE IF NOT EXISTS "CustomAppSchema" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "uiSchema" JSONB NOT NULL,
    "isGlobal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomAppSchema_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CustomAppData" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "schemaId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomAppData_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CustomAppSchema_organizationId_idx" ON "CustomAppSchema"("organizationId");
CREATE INDEX IF NOT EXISTS "CustomAppSchema_organizationId_createdAt_idx" ON "CustomAppSchema"("organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "CustomAppSchema_isGlobal_idx" ON "CustomAppSchema"("isGlobal");

CREATE INDEX IF NOT EXISTS "CustomAppData_organizationId_idx" ON "CustomAppData"("organizationId");
CREATE INDEX IF NOT EXISTS "CustomAppData_schemaId_idx" ON "CustomAppData"("schemaId");
CREATE INDEX IF NOT EXISTS "CustomAppData_organizationId_schemaId_createdAt_idx" ON "CustomAppData"("organizationId", "schemaId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "CustomAppSchema" ADD CONSTRAINT "CustomAppSchema_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CustomAppData" ADD CONSTRAINT "CustomAppData_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CustomAppData" ADD CONSTRAINT "CustomAppData_schemaId_fkey"
    FOREIGN KEY ("schemaId") REFERENCES "CustomAppSchema"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
