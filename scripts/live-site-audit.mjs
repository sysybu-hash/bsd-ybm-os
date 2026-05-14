import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const email = process.env.E2E_EMAIL ?? "owner@bsd-demo.test";
const password = process.env.E2E_PASSWORD ?? "Demo!2026";
const outDir = path.join(process.cwd(), "docs", "qa", "live-site-audit");
fs.mkdirSync(outDir, { recursive: true });

const routes = [
  "/app",
  "/app/admin",
  "/app/advanced",
  "/app/ai",
  "/app/automations",
  "/app/billing",
  "/app/business",
  "/app/clients",
  "/app/clients/advanced",
  "/app/documents",
  "/app/documents/erp",
  "/app/documents/issue",
  "/app/documents/issued",
  "/app/finance",
  "/app/help",
  "/app/inbox",
  "/app/inbox/advanced",
  "/app/insights",
  "/app/insights/advanced",
  "/app/intelligence",
  "/app/onboarding",
  "/app/operations",
  "/app/operations/advanced",
  "/app/operations/meckano",
  "/app/portal",
  "/app/projects",
  "/app/settings",
  "/app/settings/advanced",
  "/app/settings/automations",
  "/app/settings/billing",
  "/app/settings/operations",
  "/app/settings/organization",
  "/app/settings/overview",
  "/app/settings/platform",
  "/app/settings/presence",
  "/app/settings/profession",
  "/app/settings/stack",
  "/app/success",
  "/app/trial-expired",
];

function safeRoute(route) {
  return route.replace(/^\/+/, "").replace(/[/:?&=]+/g, "_") || "home";
}

async function setConsent(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "bsd-ybm-cookie-consent-v1",
      JSON.stringify({
        version: 1,
        necessary: true,
        analytics: false,
        marketing: false,
        updatedAt: new Date().toISOString(),
      }),
    );
  });
}

async function login(page) {
  await setConsent(page);
  await page.goto("/login?callbackUrl=%2Fapp", { waitUntil: "domcontentloaded" });
  const csrf = await page.request.get("/api/auth/csrf").then((r) => r.json());
  await page.request.post("/api/auth/callback/credentials", {
    form: {
      csrfToken: csrf.csrfToken,
      email,
      password,
      callbackUrl: `${baseURL}/app`,
      json: "true",
    },
  });
  const session = await page.request.get("/api/auth/session").then((r) => r.json()).catch(() => null);
  if (session?.user && !page.url().includes("/app")) {
    await page.goto("/app", { waitUntil: "networkidle" });
  }
  if (!page.url().includes("/app")) {
    await page.goto("/app", { waitUntil: "networkidle" });
  }
  if (!page.url().includes("/app")) {
    throw new Error(`Login did not reach /app. Current URL: ${page.url()}`);
  }
}

async function collectPageState(page, route, viewportName) {
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(err.message));

  const response = await page.goto(route, { waitUntil: "networkidle", timeout: 60_000 }).catch((error) => {
    pageErrors.push(error.message);
    return null;
  });
  await page.waitForTimeout(500);

  const bodyText = await page.locator("body").innerText().catch(() => "");
  const title = await page.title().catch(() => "");
  const finalUrl = page.url();
  const hasHorizontalOverflow = await page
    .evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 4)
    .catch(() => false);
  const visibleButtons = await page
    .locator("button:visible")
    .evaluateAll((nodes) =>
      nodes.map((node) => ({
        text: (node.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 120),
        aria: node.getAttribute("aria-label"),
        disabled: node.hasAttribute("disabled"),
        type: node.getAttribute("type"),
      })),
    )
    .catch(() => []);
  const visibleLinks = await page
    .locator("a:visible")
    .evaluateAll((nodes) =>
      nodes.map((node) => ({
        text: (node.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 120),
        href: node.getAttribute("href"),
      })),
    )
    .catch(() => []);
  const emptyBlocks = await page
    .locator("main section, main article, main [class*='card'], main [class*='Card']")
    .evaluateAll((nodes) =>
      nodes
        .map((node) => ({
          textLength: (node.textContent ?? "").trim().length,
          className: node.getAttribute("class") ?? "",
        }))
        .filter((node) => node.textLength === 0)
        .slice(0, 20),
    )
    .catch(() => []);

  await page.screenshot({
    path: path.join(outDir, `${viewportName}-${safeRoute(route)}.png`),
    fullPage: true,
  });

  return {
    route,
    viewport: viewportName,
    status: response?.status() ?? null,
    finalUrl,
    title,
    bodyTextLength: bodyText.trim().length,
    blankish: bodyText.trim().length < 40,
    hasHorizontalOverflow,
    buttonCount: visibleButtons.length,
    linkCount: visibleLinks.length,
    visibleButtons,
    visibleLinks,
    emptyBlocks,
    consoleErrors,
    pageErrors,
  };
}

async function checkScanApis(page) {
  const meta = await page.request.get("/api/scan/engine-meta");
  const metaBody = await meta.json().catch(async () => ({ raw: await meta.text() }));

  const missingFile = await page.request.post("/api/scan/tri-engine", {
    multipart: {
      scanMode: "INVOICE_FINANCIAL",
      persist: "false",
    },
  });
  const missingFileBody = await missingFile.json().catch(async () => ({ raw: await missingFile.text() }));

  const streamMissingFile = await page.request.post("/api/scan/tri-engine/stream", {
    multipart: {
      scanMode: "INVOICE_FINANCIAL",
      persist: "false",
    },
  });
  const streamMissingFileBody = await streamMissingFile.text();

  return {
    engineMeta: { status: meta.status(), body: metaBody },
    triEngineMissingFile: { status: missingFile.status(), body: missingFileBody },
    triEngineStreamMissingFile: {
      status: streamMissingFile.status(),
      body: streamMissingFileBody.trim().slice(0, 500),
    },
  };
}

const browser = await chromium.launch({ headless: true });
const results = [];
let scanApis = null;

try {
  for (const viewport of [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({ baseURL, viewport });
    await login(page);
    if (viewport.name === "desktop") {
      scanApis = await checkScanApis(page);
    }
    for (const route of routes) {
      results.push(await collectPageState(page, route, viewport.name));
    }
    await page.close();
  }
} finally {
  await browser.close();
}

const findings = results.filter(
  (item) =>
    item.blankish ||
    item.hasHorizontalOverflow ||
    item.pageErrors.length ||
    item.consoleErrors.length ||
    (item.status !== null && item.status >= 500) ||
    item.finalUrl.includes("/login"),
);

const report = {
  checkedAt: new Date().toISOString(),
  baseURL,
  email,
  routeCount: routes.length,
  resultCount: results.length,
  scanApis,
  findings,
  results,
};

fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));

const markdown = [
  "# Live Site Audit",
  "",
  `Checked at: ${report.checkedAt}`,
  `Base URL: ${baseURL}`,
  `User: ${email}`,
  `Routes: ${routes.length}`,
  `Viewport checks: ${results.length}`,
  "",
  "## Scan APIs",
  "",
  "```json",
  JSON.stringify(scanApis, null, 2),
  "```",
  "",
  "## Findings",
  "",
  findings.length
    ? findings
        .map(
          (f) =>
            `- ${f.viewport} ${f.route}: status=${f.status}, final=${f.finalUrl}, blank=${f.blankish}, overflow=${f.hasHorizontalOverflow}, console=${f.consoleErrors.length}, page=${f.pageErrors.length}`,
        )
        .join("\n")
    : "No blocking visual/runtime findings.",
  "",
  "## Route Summary",
  "",
  ...results.map(
    (r) =>
      `- ${r.viewport} ${r.route}: ${r.status}, buttons=${r.buttonCount}, links=${r.linkCount}, text=${r.bodyTextLength}, overflow=${r.hasHorizontalOverflow}`,
  ),
  "",
].join("\n");

fs.writeFileSync(path.join(outDir, "report.md"), markdown);

console.log(`Live audit report: ${path.join(outDir, "report.md")}`);
console.log(`Checked ${results.length} route/viewport combinations.`);
if (findings.length) {
  console.log(`Findings: ${findings.length}`);
  for (const finding of findings.slice(0, 20)) {
    console.log(`- ${finding.viewport} ${finding.route}: ${finding.finalUrl}`);
  }
  process.exitCode = 1;
} else {
  console.log("Live audit passed.");
}
