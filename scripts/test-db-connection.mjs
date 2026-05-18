import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("missing DATABASE_URL");
  process.exit(1);
}

const pool = new Pool({ connectionString: url });
try {
  const result = await pool.query("SELECT 1 AS ok");
  console.log("neon_ws_ok", result.rows);
} catch (e) {
  console.error("neon_ws_fail", e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
