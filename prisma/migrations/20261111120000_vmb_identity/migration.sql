-- VisualModuBuild identity: its own users, password credentials and sessions.
-- Additive only; nothing existing is touched and nothing references the
-- platform's User or Organization tables.
CREATE TABLE IF NOT EXISTS "VmbUser" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "googleSub" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "VmbUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "VmbPasswordCredential" (
    "userId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VmbPasswordCredential_pkey" PRIMARY KEY ("userId"),
    CONSTRAINT "VmbPasswordCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "VmbUser"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "VmbSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VmbSession_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "VmbSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "VmbUser"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Not CONCURRENTLY: migrate deploy runs inside a transaction, and the tables are new and empty.
CREATE UNIQUE INDEX IF NOT EXISTS "VmbUser_email_key" ON "VmbUser"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "VmbUser_googleSub_key" ON "VmbUser"("googleSub");
CREATE INDEX IF NOT EXISTS "VmbSession_userId_idx" ON "VmbSession"("userId");
CREATE INDEX IF NOT EXISTS "VmbSession_expiresAt_idx" ON "VmbSession"("expiresAt");
