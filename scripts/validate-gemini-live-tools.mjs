/**
 * בדיקת תצורת Gemini Live + כלי אוטומציה (ללא חיבור WebSocket מלא).
 * הרצה: node scripts/validate-gemini-live-tools.mjs
 */
import { readFileSync } from "fs";

const root = process.cwd();
const liveTools = readFileSync(`${root}/lib/os-assistant/live-tools.ts`, "utf8");
const toolHandler = readFileSync(`${root}/lib/os-assistant/tool-handler.ts`, "utf8");
const sessionRoute = readFileSync(`${root}/app/api/ai/gemini-live/session/route.ts`, "utf8");

const checks = [
  ["live-tools מכיל execute_os_command", /execute_os_command/.test(liveTools)],
  ["live-tools מכיל run_automation", /run_automation/.test(liveTools)],
  ["tool-handler קורא execute-tool API", /execute-tool/.test(toolHandler)],
  ["session בודק geminiLiveEnabled", /geminiLiveEnabled/.test(sessionRoute)],
  ["session בודק maintenanceMode", /maintenanceMode/.test(sessionRoute)],
];

let failed = 0;
for (const [label, ok] of checks) {
  console.log(ok ? `✓ ${label}` : `✗ ${label}`);
  if (!ok) failed += 1;
}

if (failed > 0) {
  process.exit(1);
}
console.log("\nכל בדיקות התצורה עברו.");
