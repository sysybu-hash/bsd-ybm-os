#!/usr/bin/env node
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { applyProjectEnvFiles } from "./load-project-env.mjs";

applyProjectEnvFiles();
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  const mig = await pool.query(
    `SELECT migration_name, started_at, finished_at, rolled_back_at, LEFT(logs::text, 500) AS logs
     FROM _prisma_migrations
     WHERE migration_name LIKE '20260527%'
     ORDER BY migration_name`,
  );
  console.log("migrations:", JSON.stringify(mig.rows, null, 2));

  const tables = await pool.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name IN ('UserGoogleCalendarSettings', 'GoogleCalendarEventLink')
     ORDER BY table_name`,
  );
  console.log("tables:", tables.rows.map((r) => r.table_name));

  const enums = await pool.query(
    `SELECT typname FROM pg_type WHERE typname LIKE 'GoogleCalendar%' ORDER BY typname`,
  );
  console.log("enums:", enums.rows.map((r) => r.typname));

  const colorCol = await pool.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'UserGoogleCalendarSettings'
       AND column_name = 'calendarColor'`,
  );
  console.log("calendarColor exists:", colorCol.rows.length > 0);
} finally {
  await pool.end();
}
