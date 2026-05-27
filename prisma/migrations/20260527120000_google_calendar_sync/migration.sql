-- Google Calendar sync (opt-in per user)

CREATE TYPE "GoogleCalendarSyncMode" AS ENUM ('OFF', 'READ_ONLY', 'BIDIRECTIONAL');
CREATE TYPE "GoogleCalendarEntityType" AS ENUM ('TASK', 'STANDALONE');
CREATE TYPE "GoogleCalendarSyncSource" AS ENUM ('GOOGLE', 'LOCAL');

CREATE TABLE "UserGoogleCalendarSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "syncMode" "GoogleCalendarSyncMode" NOT NULL DEFAULT 'OFF',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "consentAt" TIMESTAMP(3),
    "consentVersion" TEXT,
    "calendarId" TEXT,
    "calendarSummary" TEXT,
    "syncToken" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "reminderMinutesBefore" INTEGER NOT NULL DEFAULT 15,
    "pushEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserGoogleCalendarSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GoogleCalendarEventLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "googleCalendarId" TEXT NOT NULL,
    "googleEventId" TEXT NOT NULL,
    "googleEtag" TEXT,
    "entityType" "GoogleCalendarEntityType" NOT NULL DEFAULT 'STANDALONE',
    "taskId" TEXT,
    "summary" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "htmlLink" TEXT,
    "lastSyncedFrom" "GoogleCalendarSyncSource" NOT NULL DEFAULT 'GOOGLE',
    "pushNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleCalendarEventLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserGoogleCalendarSettings_userId_organizationId_key" ON "UserGoogleCalendarSettings"("userId", "organizationId");
CREATE INDEX "UserGoogleCalendarSettings_organizationId_idx" ON "UserGoogleCalendarSettings"("organizationId");
CREATE INDEX "UserGoogleCalendarSettings_enabled_syncMode_idx" ON "UserGoogleCalendarSettings"("enabled", "syncMode");

CREATE UNIQUE INDEX "GoogleCalendarEventLink_userId_googleCalendarId_googleEventId_key" ON "GoogleCalendarEventLink"("userId", "googleCalendarId", "googleEventId");
CREATE INDEX "GoogleCalendarEventLink_userId_startAt_idx" ON "GoogleCalendarEventLink"("userId", "startAt");
CREATE INDEX "GoogleCalendarEventLink_organizationId_startAt_idx" ON "GoogleCalendarEventLink"("organizationId", "startAt");
CREATE INDEX "GoogleCalendarEventLink_taskId_idx" ON "GoogleCalendarEventLink"("taskId");
CREATE INDEX "GoogleCalendarEventLink_pushNotifiedAt_startAt_idx" ON "GoogleCalendarEventLink"("pushNotifiedAt", "startAt");

ALTER TABLE "UserGoogleCalendarSettings" ADD CONSTRAINT "UserGoogleCalendarSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserGoogleCalendarSettings" ADD CONSTRAINT "UserGoogleCalendarSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GoogleCalendarEventLink" ADD CONSTRAINT "GoogleCalendarEventLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GoogleCalendarEventLink" ADD CONSTRAINT "GoogleCalendarEventLink_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GoogleCalendarEventLink" ADD CONSTRAINT "GoogleCalendarEventLink_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
