-- CreateTable
CREATE TABLE "PlatformSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "configJson" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "PlatformSettings" ("id", "configJson", "updatedAt")
VALUES (
    'default',
    '{"version":1,"maintenanceMode":false,"maintenanceMessage":"","registrationOpen":true,"defaultTrialDays":30,"defaultTrialScans":30,"automationEnabled":{},"featureFlags":{"meckanoGlobal":true,"geminiLiveEnabled":true,"driveSyncDefault":true}}'::jsonb,
    CURRENT_TIMESTAMP
);
