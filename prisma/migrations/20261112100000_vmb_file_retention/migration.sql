-- VMB privacy (rule 13.11): how many days after a booklet is delivered the office's source files are deleted.
-- NULL keeps them until the office deletes them by hand.
ALTER TABLE "VmbWorkspace" ADD COLUMN IF NOT EXISTS "fileRetentionDays" INTEGER DEFAULT 30;
