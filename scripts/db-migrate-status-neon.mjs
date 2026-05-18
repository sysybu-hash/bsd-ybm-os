/**
 * סטטוס מיגרציות דרך Neon WebSocket (עוקף P1001 של Prisma CLI ב-Windows + IPv6).
 * דורש DATABASE_URL תקין ב-.env.local.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = resolve(root, "prisma", "migrations");

neonConfig.webSocketConstructor = ws;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("חסר DATABASE_URL — הרץ עם: npx dotenv -e .env.local -- node scripts/db-migrate-status-neon.mjs");
  process.exit(1);
}

function listLocalMigrations() {
  if (!existsSync(migrationsDir)) return [];
  return readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d{14}_/.test(d.name))
    .map((d) => d.name)
    .sort();
}

const pool = new Pool({ connectionString: url });

try {
  const { rows } = await pool.query(
    `SELECT migration_name, finished_at, rolled_back_at, logs
     FROM _prisma_migrations
     ORDER BY finished_at NULLS LAST, migration_name`,
  );

  const local = listLocalMigrations();
  const applied = new Set(
    rows
      .filter((r) => r.finished_at && !r.rolled_back_at)
      .map((r) => r.migration_name),
  );
  const failed = rows.filter((r) => r.logs && !r.finished_at);
  const pending = local.filter((m) => !applied.has(m));
  const missingInLocal = [...applied].filter((m) => !local.includes(m));

  console.log("חיבור Neon (WebSocket): הצליח");
  console.log(`מיגרציות מקומיות: ${local.length}`);
  console.log(`הוחלו ב-DB: ${applied.size}`);

  if (failed.length) {
    console.log("\nמיגרציות שנכשלו:");
    for (const f of failed) console.log(`  - ${f.migration_name}`);
  }

  if (pending.length) {
    console.log("\nממתינות להחלה:");
    for (const m of pending) console.log(`  - ${m}`);
    console.log("\nלהחלה בפיתוח: npm run db:migrate");
    console.log("בפרודקשן: npm run db:migrate:prod");
    process.exitCode = 1;
  } else if (missingInLocal.length) {
    console.log("\nקיימות ב-DB אך חסרות מקומית:");
    for (const m of missingInLocal) console.log(`  - ${m}`);
    process.exitCode = 1;
  } else {
    console.log("\nמסד הנתונים מעודכן (אין מיגרציות ממתינות).");
  }
} catch (e) {
  const msg = e?.message ?? String(e);
  if (/password authentication failed/i.test(msg)) {
    console.error(
      "שגיאת סיסמה — העתיקו מחדש את מחרוזת החיבור מ-Neon Console ל-DATABASE_URL ב-.env.local",
    );
  } else if (/can't reach|econnrefused|etimedout|enotfound/i.test(msg)) {
    console.error("לא ניתן להתחבר ל-Neon — ודאו שהפרויקט פעיל (Resume) ושה-URL נכון.");
  } else {
    console.error("שגיאה:", msg);
  }
  process.exit(1);
} finally {
  await pool.end();
}
