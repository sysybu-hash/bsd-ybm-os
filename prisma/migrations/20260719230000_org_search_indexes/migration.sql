-- Support capped semantic-search / recent-org reads
CREATE INDEX IF NOT EXISTS "Project_organizationId_updatedAt_idx" ON "Project"("organizationId", "updatedAt");
CREATE INDEX IF NOT EXISTS "Contact_organizationId_createdAt_idx" ON "Contact"("organizationId", "createdAt");
