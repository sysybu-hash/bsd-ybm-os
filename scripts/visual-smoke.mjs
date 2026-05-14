import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.VISUAL_BASE_URL || "http://localhost:3000";
const outDir = path.join(process.cwd(), "docs", "qa", "visual-smoke");
fs.mkdirSync(outDir, { recursive: true });

const routes = [
  "/",
  "/login",
  "/register",
  "/pricing",
  "/product",
  "/solutions",
  "/about",
  "/contact",
  "/tutorial",
  "/app",
  "/app/settings/overview",
];

const viewports = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 },
];

const browser = await chromium.launch({ headless: true });
const report = [];

for (const viewport of viewports) {
  const page = await browser.newPage({ viewport });
  const consoleErrors = [];
  const pageErrors = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => pageErrors.push(err.message));

  for (const route of routes) {
    const url = `${baseUrl}${route}`;
    const startedWith = consoleErrors.length;
    const startedPageErrors = pageErrors.length;
    let status = null;
    let finalUrl = "";
    let title = "";
    let bodyTextLength = 0;
    let hasHorizontalOverflow = false;
    let blankish = false;

    try {
      const response = await page.goto(url, { waitUntil: "networkidle", timeout: 45_000 });
      status = response?.status() ?? null;
      finalUrl = page.url();
      title = await page.title();
      bodyTextLength = await page.locator("body").innerText({ timeout: 5_000 }).then((text) => text.trim().length);
      hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 4);
      blankish = bodyTextLength < 20;

      const fileSafeRoute = route === "/" ? "home" : route.replace(/^\/+/, "").replace(/[\/:]/g, "_");
      await page.screenshot({
        path: path.join(outDir, `${viewport.name}-${fileSafeRoute}.png`),
        fullPage: true,
      });
    } catch (err) {
      pageErrors.push(`${route}: ${err.message}`);
    }

    report.push({
      route,
      viewport: viewport.name,
      status,
      finalUrl,
      title,
      bodyTextLength,
      hasHorizontalOverflow,
      blankish,
      consoleErrors: consoleErrors.slice(startedWith),
      pageErrors: pageErrors.slice(startedPageErrors),
    });
  }

  await page.close();
}

await browser.close();

const reportPath = path.join(outDir, "report.json");
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

const failed = report.filter(
  (item) =>
    item.pageErrors.length ||
    item.consoleErrors.length ||
    item.hasHorizontalOverflow ||
    item.blankish ||
    (item.status !== null && item.status >= 500),
);

console.log(`Visual smoke report: ${reportPath}`);
console.log(`Checked ${report.length} route/viewport combinations.`);
if (failed.length) {
  console.log("Findings:");
  for (const item of failed) {
    console.log(
      `- ${item.viewport} ${item.route}: status=${item.status}, overflow=${item.hasHorizontalOverflow}, blankish=${item.blankish}, consoleErrors=${item.consoleErrors.length}, pageErrors=${item.pageErrors.length}`,
    );
  }
  process.exit(1);
}

console.log("Visual smoke passed.");
