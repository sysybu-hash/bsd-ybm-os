#!/usr/bin/env node
/**
 * מתקן רשומות _prisma_migrations שנכשלו אך הסכמה כבר קיימת (למשל עמודה כבר נוספה ב-db push).
 * הרצה: npx dotenv -e .env.local -- node scripts/repair-failed-prisma-migrations.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { applyProjectEnvFiles } from "./load-project-env.mjs";

applyProjectEnvFiles();
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
  console.error("חסר DATABASE_URL");
  process.exit(1);
}

function checksum(sql) {
  return createHash("sha256").update(sql).digest("hex");
}

const pool = new Pool({ connectionString: url });

/** @type {{ name: string, test: () => Promise<boolean> }[]} */
const REPAIRS = [
  {
    name: "20260520190000_user_launcher_config",
    async test() {
      const { rows } = await pool.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'User' AND column_name = 'launcherConfigJson'`,
      );
      return rows.length > 0;
    },
  },
  {
    name: "20260521120000_auth_passkey_password_reset",
    async test() {
      const { rows } = await pool.query(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.tables
           WHERE table_schema = 'public' AND table_name = 'UserPasskey'
         ) AS e`,
      );
      return rows[0]?.e === true;
    },
  },
];

/**
 * Migrations that used CONCURRENTLY (invalid inside transactions) and must be
 * rolled-back so migrate deploy can re-apply them with the fixed SQL.
 * The orphan-cleanup step above will delete the rolled-back record; migrate
 * deploy will then find the migration on disk and apply it fresh.
 */
const ROLLBACK_REPAIRS = new Set([
  "20260521180000_add_missing_indexes",
]);

try {
  const failed = await pool.query(
    `SELECT migration_name, logs
     FROM _prisma_migrations
     WHERE finished_at IS NULL AND rolled_back_at IS NULL AND logs IS NOT NULL`,
  );

  const orphan = await pool.query(
    `DELETE FROM _prisma_migrations
     WHERE finished_at IS NULL AND rolled_back_at IS NOT NULL`,
  );
  if (orphan.rowCount > 0) {
    console.log("נמחקו רשומות מיגרציה יתומות (rolled_back ללא finished_at):", orphan.rowCount);
  }

  if (!failed.rows.length) {
    console.log("אין מיגרציות במצב failed — הכל תקין.");
    process.exit(0);
  }

  for (const row of failed.rows) {
    const name = row.migration_name;

    // Migrations that failed due to CONCURRENTLY-in-transaction: roll them back
    // so migrate deploy can re-apply the fixed SQL on the next run.
    if (ROLLBACK_REPAIRS.has(name)) {
      await pool.query(
        `UPDATE _prisma_migrations SET rolled_back_at = NOW() WHERE migration_name = $1`,
        [name],
      );
      console.log("סומן כבוטל (יוחל מחדש עם SQL מתוקן):", name);
      continue;
    }

    const repair = REPAIRS.find((r) => r.name === name);
    if (!repair) {
      console.warn("מיגרציה שנכשלה ללא כלל תיקון אוטומטי:", name);
      continue;
    }
    const ok = await repair.test();
    if (!ok) {
      console.warn("סכמה חסרה — לא מסמנים כהוחלה:", name);
      continue;
    }
    const sqlPath = join(migrationsDir, name, "migration.sql");
    const sql = existsSync(sqlPath) ? readFileSync(sqlPath, "utf8") : "";
    const cs = checksum(sql);
    await pool.query(
      `UPDATE _prisma_migrations
       SET finished_at = NOW(), applied_steps_count = 1, logs = NULL, checksum = $2
       WHERE migration_name = $1`,
      [name, cs],
    );
    console.log("תוקן (סומן כהוחלה):", name);
  }

  console.log("הרץ: npx prisma migrate deploy");
} finally {
  await pool.end();
}
