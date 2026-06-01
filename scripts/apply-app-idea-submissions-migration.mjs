#!/usr/bin/env node
/**
 * Applies the AppIdeaSubmission table migration to Neon.
 * Run: node scripts/apply-app-idea-submissions-migration.mjs
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { applyProjectEnvFiles } from "./load-project-env.mjs";

applyProjectEnvFiles();
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  console.log("⏳ Applying AppIdeaSubmission migration...");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "AppIdeaSubmission" (
      "id"          TEXT         NOT NULL,
      "uiSchema"    JSONB        NOT NULL,
      "appName"     TEXT         NOT NULL,
      "appType"     TEXT         NOT NULL,
      "status"      TEXT         NOT NULL DEFAULT 'pending',
      "orgIndustry" TEXT,
      "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AppIdeaSubmission_pkey" PRIMARY KEY ("id")
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS "AppIdeaSubmission_status_idx"
      ON "AppIdeaSubmission"("status");
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS "AppIdeaSubmission_createdAt_idx"
      ON "AppIdeaSubmission"("createdAt");
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS "AppIdeaSubmission_status_createdAt_idx"
      ON "AppIdeaSubmission"("status", "createdAt");
  `);

  // Verify
  const result = await pool.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'AppIdeaSubmission'
    ORDER BY ordinal_position;
  `);

  console.log("✅ Table created successfully. Columns:");
  result.rows.forEach((r) => console.log(`   ${r.column_name} — ${r.data_type}`));
} catch (err) {
  console.error("❌ Migration failed:", err.message);
  process.exit(1);
} finally {
  await pool.end();
}
