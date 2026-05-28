-- Email digest queue for batched notification emails
CREATE TABLE IF NOT EXISTS "EmailDigestItem" (
    "id" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailDigestItem_pkey" PRIMARY KEY ("id")
);

-- לא CONCURRENTLY — prisma db execute רץ בתוך transaction
CREATE INDEX IF NOT EXISTS "EmailDigestItem_recipient_category_createdAt_idx"
ON "EmailDigestItem"("recipient", "category", "createdAt");
