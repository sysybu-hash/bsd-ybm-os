-- Add ACCOUNTANT to the UserRole enum (external read-only accountant portal).
-- Idempotent: safe to re-run on Neon (no shadow DB).
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'ACCOUNTANT';
