-- VMB office invitations: an owner invites an address; the user joins the office on first sign-in.
CREATE TABLE IF NOT EXISTS "VmbInvite" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "workspaceId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "invitedById" TEXT,
  "acceptedAt" TIMESTAMP(3),
  CONSTRAINT "VmbInvite_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VmbInvite_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "VmbWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "VmbInvite_workspaceId_email_key" ON "VmbInvite"("workspaceId", "email");
CREATE INDEX IF NOT EXISTS "VmbInvite_email_idx" ON "VmbInvite"("email");
