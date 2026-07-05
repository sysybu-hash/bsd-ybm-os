-- WhatsApp Cloud API — confirmed phone→org/user links. Idempotent for Neon.
CREATE TABLE IF NOT EXISTS "WhatsappLink" (
  "id" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastMessageAt" TIMESTAMP(3),
  CONSTRAINT "WhatsappLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WhatsappLink_phone_key" ON "WhatsappLink"("phone");
CREATE INDEX IF NOT EXISTS "WhatsappLink_organizationId_idx" ON "WhatsappLink"("organizationId");
CREATE INDEX IF NOT EXISTS "WhatsappLink_userId_idx" ON "WhatsappLink"("userId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'WhatsappLink_organizationId_fkey') THEN
    ALTER TABLE "WhatsappLink" ADD CONSTRAINT "WhatsappLink_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'WhatsappLink_userId_fkey') THEN
    ALTER TABLE "WhatsappLink" ADD CONSTRAINT "WhatsappLink_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
