import { chromium } from "@playwright/test";
const BASE = "https://www.bsd-ybm.co.il";
const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: "reports/.lighthouse-auth-state.json" });
const page = await ctx.newPage();
const errs = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
page.on("requestfailed", (r) => errs.push("REQFAIL " + r.url().slice(-60) + " :: " + (r.failure()?.errorText ?? "")));
await page.goto(`${BASE}/app/builder`, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForTimeout(3000);
for (const name of ["chat", "generate"]) {
  const r = await ctx.request.post(`${BASE}/api/ai-builder/${name}`, {
    headers: { "Content-Type": "application/json" },
    data: name === "chat"
      ? { messages: [{ role: "user", content: "דשבורד עם 5 כרטיסי מטריקה" }] }
      : { prompt: "דשבורד עם 5 כרטיסי מטריקה" },
    timeout: 90000,
  }).catch((e) => ({ status: () => "ERR", text: async () => String(e).slice(0, 200), headers: () => ({}) }));
  const body = await r.text();
  console.log(`--- /api/ai-builder/${name}: ${typeof r.status === "function" ? r.status() : r.status}`);
  console.log("   " + body.replace(/\s+/g, " ").slice(0, 300));
}
console.log("console/net errors:", errs.slice(0, 6));
await browser.close();
