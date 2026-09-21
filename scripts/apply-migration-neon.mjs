#!/usr/bin/env node
/**
 * Applies one Prisma migration over Neon's WebSocket driver and records it in
 * _prisma_migrations, exactly as `prisma migrate deploy` would.
 *
 * `migrate deploy` needs TCP 5432, which some networks block; the WebSocket
 * driver goes over 443. The SQL runs in one transaction with the bookkeeping
 * row, so a failure leaves nothing half-applied, and a migration already
 * recorded is refused rather than run twice.
 *
 * Run: npx dotenv -e .env.local -- node scripts/apply-migration-neon.mjs <migration_dir_name>
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const name = process.argv[2];
if (!name) {
  console.error("usage: node scripts/apply-migration-neon.mjs <migration_dir_name>");
  process.exit(1);
}
const file = join(root, "prisma", "migrations", name, "migration.sql");
if (!existsSync(file)) {
  console.error(`no such migration: ${file}`);
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set — run through dotenv -e .env.local");
  process.exit(1);
}

neonConfig.webSocketConstructor = ws;
const sql = readFileSync(file, "utf8");
const checksum = createHash("sha256").update(sql).digest("hex");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  const done = await client.query(
    `SELECT finished_at FROM _prisma_migrations WHERE migration_name = $1`,
    [name],
  );
  if (done.rows.some((row) => row.finished_at)) {
    console.log(`already applied: ${name}`);
    process.exit(0);
  }
  await client.query("BEGIN");
  await client.query(sql);
  await client.query(
    `INSERT INTO _prisma_migrations
       (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
     VALUES ($1, $2, NOW(), $3, NULL, NULL, NOW(), 1)`,
    [randomUUID(), checksum, name],
  );
  await client.query("COMMIT");
  console.log(`applied: ${name}`);
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(`failed, rolled back: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
