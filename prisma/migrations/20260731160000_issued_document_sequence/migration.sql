-- Atomic document number allocator per organization + DocType
CREATE TABLE "IssuedDocumentSequence" (
    "organizationId" TEXT NOT NULL,
    "type" "DocType" NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 1000,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IssuedDocumentSequence_pkey" PRIMARY KEY ("organizationId","type")
);

ALTER TABLE "IssuedDocumentSequence" ADD CONSTRAINT "IssuedDocumentSequence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed from existing documents so the next allocate continues the sequence
INSERT INTO "IssuedDocumentSequence" ("organizationId", "type", "lastNumber", "updatedAt")
SELECT "organizationId", "type", MAX("number"), NOW()
FROM "IssuedDocument"
GROUP BY "organizationId", "type"
ON CONFLICT ("organizationId", "type") DO UPDATE
SET "lastNumber" = GREATEST("IssuedDocumentSequence"."lastNumber", EXCLUDED."lastNumber"),
    "updatedAt" = NOW();
