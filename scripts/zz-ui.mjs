import { chromium } from "@playwright/test";
const BASE = "https://www.bsd-ybm.co.il";
const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: "reports/.lighthouse-auth-state.json", viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
const errs = [], calls = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 220)); });
page.on("pageerror", (e) => errs.push("PAGEERROR " + String(e).slice(0, 220)));
const t0 = Date.now();
page.on("request", (r) => { if (r.url().includes("/api/ai-builder/")) calls.push(`[${Date.now()-t0}ms] REQ ${r.url().replace(BASE, "")}`); });
page.on("response", async (r) => { if (r.url().includes("/api/ai-builder/")) { const b = await r.text().catch(()=>""); calls.push(`[${Date.now()-t0}ms] RES ${r.status()} len=${b.length} :: ${b.replace(/\s+/g," ").slice(0,180)}`); } });
page.on("requestfailed", (r) => { if (r.url().includes("/api/ai-builder/")) calls.push(`[${Date.now()-t0}ms] FAILED ${r.failure()?.errorText}`); });
page.on("requestfailed", (r) => { if (r.url().includes("/api/ai-builder/")) calls.push(`FAILED ${r.url().split("/").pop()} :: ${r.failure()?.errorText}`); });

await page.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded", timeout: 90000 });
await ctx.request.patch(`${BASE}/api/user/workspace-layout`, { data: { widgets: [] } });
await page.goto(`${BASE}/app/builder`, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForTimeout(18000);

const shell = page.locator('[data-widget-shell][id^="aiHub-"]').last();
const box = shell.getByPlaceholder(/דשבורד לקוחות|טופס ביקורת|CRM/i).nth(1);
const all = shell.getByPlaceholder(/דשבורד לקוחות|טופס ביקורת|CRM/i);
const n = await all.count();
console.log("matching inputs:", n);
for (let i = 0; i < n; i++) {
  const el = all.nth(i);
  console.log("  #" + i, "visible=", await el.isVisible().catch(()=>null), "box=", JSON.stringify(await el.boundingBox().catch(()=>null)));
}
const visible = await box.isVisible({ timeout: 15000 }).catch(() => false);
console.log("input visible:", visible, "| placeholder:", await box.getAttribute("placeholder").catch(()=>null));
if (visible) {
  await box.fill("דשבורד עם 5 כרטיסי מטריקה להוצאות ופרויקטים");
  await box.press("Enter");
  await page.waitForTimeout(95000);
}
const state = await page.evaluate(() => ({
  text: document.body.innerText.replace(/\s+/g, " ").slice(0, 400),
  iframes: document.querySelectorAll("iframe").length,
}));
console.log("api calls:", calls);
console.log("errors:", errs.slice(0, 6));
console.log("iframes after:", state.iframes);
console.log("text:", state.text);
const toasts = await page.evaluate(() => [...document.querySelectorAll("[data-sonner-toast], [role=status], [role=alert]")].map(n => n.textContent.trim().slice(0,120)).filter(Boolean));
console.log("toasts:", toasts.slice(0, 5));
await browser.close();
