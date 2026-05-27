#!/usr/bin/env node
/**
 * מסמן מיגרציית google_calendar_sync כהוחלה כשהסכמה כבר קיימת (כשל חוזר על enum).
 * מריץ migrate deploy ל-calendar_color.
 */
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { applyProjectEnvFiles } from "./load-project-env.mjs";

applyProjectEnvFiles();
neonConfig.webSocketConstructor = ws;

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(root, "prisma", "migrations");
const MIGRATION = "20260527120000_google_calendar_sync";

function checksum(sql) {
  return createHash("sha256").update(sql).digest("hex");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  const tables = await pool.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name IN ('UserGoogleCalendarSettings', 'GoogleCalendarEventLink')`,
  );
  if (tables.rows.length < 2) {
    console.error("חסרות טבלאות Calendar — לא מסמנים כהוחל");
    process.exit(1);
  }

  const failed = await pool.query(
    `SELECT migration_name FROM _prisma_migrations
     WHERE migration_name = $1 AND finished_at IS NULL AND rolled_back_at IS NULL`,
    [MIGRATION],
  );
  if (failed.rows.length === 0) {
    console.log("אין רשומת failed ל-", MIGRATION);
  } else {
    const sqlPath = join(migrationsDir, MIGRATION, "migration.sql");
    const sql = existsSync(sqlPath) ? readFileSync(sqlPath, "utf8") : "";
    await pool.query(
      `UPDATE _prisma_migrations
       SET finished_at = NOW(), applied_steps_count = 1, logs = NULL, checksum = $2
       WHERE migration_name = $1`,
      [MIGRATION, checksum(sql)],
    );
    console.log("סומן כהוחל:", MIGRATION);
  }

  const colorCol = await pool.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'UserGoogleCalendarSettings'
       AND column_name = 'calendarColor'`,
  );
  if (colorCol.rows.length > 0) {
    const colorMig = "20260527140000_calendar_color";
    const existing = await pool.query(
      `SELECT 1 FROM _prisma_migrations WHERE migration_name = $1 AND finished_at IS NOT NULL`,
      [colorMig],
    );
    if (existing.rows.length === 0) {
      const sqlPath = join(migrationsDir, colorMig, "migration.sql");
      const sql = readFileSync(sqlPath, "utf8");
      await pool.query(
        `INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
         VALUES (gen_random_uuid()::text, $1, NOW(), $2, NULL, NULL, NOW(), 1)`,
        [checksum(sql), colorMig],
      );
      console.log("סומן כהוחל (עמודה כבר קיימת):", colorMig);
    }
  }
} finally {
  await pool.end();
}

execSync("npx prisma migrate deploy", { stdio: "inherit", env: process.env });
console.log("Neon migrations OK");
