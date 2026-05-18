/**
 * מתקן רשומות _prisma_migrations: baseline חסר מקומית, מיגרציה שנכשלה.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = resolve(root, "prisma", "migrations");

neonConfig.webSocketConstructor = ws;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("הרץ עם: npx dotenv -e .env.local -- node scripts/fix-prisma-migrations-neon.mjs");
  process.exit(1);
}

const BASELINE = "20260325223000_postgres_baseline";
const FAILED = "20260427220000_add_expense_record";

function checksum(sql) {
  return createHash("sha256").update(sql).digest("hex");
}

const baselineDir = join(migrationsDir, BASELINE);
const baselineFile = join(baselineDir, "migration.sql");
if (!existsSync(baselineFile)) {
  mkdirSync(baselineDir, { recursive: true });
  writeFileSync(
    baselineFile,
    "-- Baseline applied on Neon before local migration history; placeholder for Prisma drift.\n",
    "utf8",
  );
  console.log("נוצרה תיקיית baseline מקומית:", BASELINE);
}

const expenseSql = readFileSync(
  join(migrationsDir, FAILED, "migration.sql"),
  "utf8",
);

const pool = new Pool({ connectionString: url });

try {
  const tableCheck = await pool.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'ExpenseRecord'
     ) AS exists`,
  );
  const expenseExists = tableCheck.rows[0]?.exists === true;

  const failedRow = await pool.query(
    `SELECT finished_at, rolled_back_at, logs
     FROM _prisma_migrations WHERE migration_name = $1`,
    [FAILED],
  );

  if (failedRow.rows.length && !failedRow.rows[0].finished_at) {
    if (!expenseExists) {
      console.log("מחיל SQL של", FAILED, "...");
      await pool.query(expenseSql);
    }
    const cs = checksum(expenseSql);
    await pool.query(
      `UPDATE _prisma_migrations
       SET finished_at = NOW(), applied_steps_count = 1, logs = NULL
       WHERE migration_name = $1`,
      [FAILED],
    );
    console.log("סומנה מיגרציה שנכשלה כהוחלה:", FAILED);
  } else if (expenseExists) {
    console.log("ExpenseRecord כבר קיים — ללא שינוי ב-", FAILED);
  }

  const baselineRow = await pool.query(
    `SELECT 1 FROM _prisma_migrations WHERE migration_name = $1`,
    [BASELINE],
  );
  if (baselineRow.rows.length === 0) {
    const baselineSql = readFileSync(baselineFile, "utf8");
    await pool.query(
      `INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
       VALUES (gen_random_uuid()::text, $1, NOW(), $2, NULL, NULL, NOW(), 0)`,
      [checksum(baselineSql), BASELINE],
    );
    console.log("נוספה רשומת baseline ל-DB");
  } else {
    console.log("baseline כבר ב-DB");
  }

  console.log("סיום — הרץ: npm run db:migrate:status");
} catch (e) {
  console.error("שגיאה:", e.message);
  process.exit(1);
} finally {
  await pool.end();
}
