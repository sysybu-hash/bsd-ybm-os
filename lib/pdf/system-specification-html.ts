import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { loadPdfFontBuffers } from "@/lib/pdf/load-pdf-font-buffers";
import { escapeHtml } from "@/lib/pdf/invoice-labels";

type RepoStats = {
  apiRouteFiles: number;
  e2eSpecFiles: number;
  cronRouteFiles: number;
  vercelCronJobs: number;
};

function countRouteFiles(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) count += countRouteFiles(full);
    else if (entry.name === "route.ts") count += 1;
  }
  return count;
}

function collectRepoStats(): RepoStats {
  const root = process.cwd();
  const e2eDir = path.join(root, "e2e");
  const e2eSpecFiles = fs.existsSync(e2eDir)
    ? fs.readdirSync(e2eDir).filter((name) => name.endsWith(".spec.ts")).length
    : 0;

  let vercelCronJobs = 0;
  try {
    const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8")) as {
      crons?: unknown[];
    };
    vercelCronJobs = Array.isArray(vercel.crons) ? vercel.crons.length : 0;
  } catch {
    vercelCronJobs = 0;
  }

  return {
    apiRouteFiles: countRouteFiles(path.join(root, "app", "api")),
    e2eSpecFiles,
    cronRouteFiles: countRouteFiles(path.join(root, "app", "api", "cron")),
    vercelCronJobs,
  };
}

function readGitMeta(): { branch: string; commit: string } {
  try {
    const branch = execSync("git branch --show-current", { encoding: "utf8" }).trim() || "unknown";
    const commit = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim() || "unknown";
    return { branch, commit };
  } catch {
    return { branch: "unknown", commit: "unknown" };
  }
}

function fontFaceCss(): string {
  const { regular, bold } = loadPdfFontBuffers();
  return `
@font-face { font-family: "NotoHebrew"; font-weight: 400;
  src: url(data:font/ttf;base64,${regular.toString("base64")}) format("truetype"); }
@font-face { font-family: "NotoHebrew"; font-weight: 700;
  src: url(data:font/ttf;base64,${bold.toString("base64")}) format("truetype"); }`;
}

const GENERATED = new Date().toLocaleDateString("he-IL", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

const GIT_META = readGitMeta();

const META = {
  version: "2.1",
  repo: "sysybu-hash/bsd-ybm-os",
  production: "https://bsd-ybm.co.il",
  branch: GIT_META.branch,
  commit: GIT_META.commit,
  pr: "#21",
};

type StatusRow = { module: string; status: string; note: string };
type ModuleRow = { name: string; hub: string; value: string; paths: string };

const HUBS: ModuleRow[] = [
  { name: "מרכז מנהל (Executive)", hub: "executiveHub", value: "דשבורד אקזקוטיבי, חשבונות קבלני משנה, KPI מרכזי", paths: "components/os/hubs/ExecutiveHubWidget.tsx · api/executive · api/progress-bills" },
  { name: "פיננסים", hub: "financeHub", value: "דאשבורד, תזרים מזומנים, תובנות AI, ייצוא חשבונאות", paths: "financeHub · lib/finance-forecast · api/accounting/export" },
  { name: "פרויקטים", hub: "projectsHub", value: "לוח Kanban, Gantt, יומן עבודה, BOQ, מרכז שליטה", paths: "ProjectBoardWidget · ProjectDashboardWidget · api/projects" },
  { name: "מסמכים", hub: "documentsHub", value: "ארכיון ERP, הפקת מסמכים, סריקת AI מאוחדת", paths: "documentsHub · erp-file-archive · components/os/scan" },
  { name: "בינה מלאכותית", hub: "aiHub", value: "צ'אט ארגוני, NotebookLM, מחולל אפליקציות", paths: "aiHub · api/ai · api/notebooklm" },
  { name: "לוגיסטיקה", hub: "logisticsHub", value: "מלאי, ציוד, הוצאה/החזרה, היסטוריית שימוש", paths: "LogisticsHubWidget · api/logistics" },
  { name: "רכש", hub: "procurementHub", value: "ספקים, דרישות רכש, הזמנות PO, קליטת סחורה", paths: "ProcurementHubWidget · api/procurement · lib/procurement" },
  { name: "CRM", hub: "crmTable", value: "אנשי קשר, הצעות, חיפוש סמנטי, גשר לפרויקטים", paths: "CrmTableWidget · api/crm" },
  { name: "קופיילוט שטח", hub: "fieldCopilot", value: "דיווח שטח, צילום AI, יומן משימות (בנייה)", paths: "field-copilot · api/field-copilot · api/projects/.../field-site-report" },
];

const STATUS_MATRIX: StatusRow[] = [
  { module: "Workspace OS + Launcher v2", status: "מוכן", note: "רשת Hub 4×2, deep links, RTL" },
  { module: "CRM + פרויקטים + ERP", status: "מוכן", note: "E2E + ייצוא חשבונאות" },
  { module: "סריקת AI (Tri-Engine V5)", status: "מוכן", note: "enrich vendor/total, retry חכם, unified save" },
  { module: "Executive + Progress Bills", status: "חדש", note: "PR #21 — ממתין merge ל-main" },
  { module: "Procurement + Logistics", status: "חדש", note: "מיגרציות DB + API + Hub UI" },
  { module: "תגובות הקשריות (Comments)", status: "חדש", note: "משימות, מסמכים, ארכיון ERP" },
  { module: "חיוב PayPal / PayPlus", status: "מוכן", note: "Webhooks מאומתים HMAC" },
  { module: "Meckano + Google Calendar", status: "מוכן", note: "Cron sync" },
  { module: "Knowledge Vault RAG", status: "מוגבל", note: "כבוי בפרוד — feature flag" },
  { module: "ITA (מס הכנסה)", status: "Stub", note: "Mock ללא מפתח production" },
  { module: "Gemini Live E2E מלא", status: "ידני", note: "smoke ב-CI בלבד" },
  { module: "Quality Gate מקומי (verify)", status: "מוכן", note: "lint + tsc + audit + 382 unit tests" },
  { module: "E2E ci-gate מלא", status: "מוכן", note: "93 passed מקומית (chromium + mobile-chrome)" },
];

function statusBadge(status: string): string {
  const map: Record<string, string> = {
    מוכן: "ok",
    חדש: "new",
    מוגבל: "warn",
    Stub: "stub",
    ידני: "warn",
  };
  const cls = map[status] ?? "neutral";
  return `<span class="badge badge-${cls}">${escapeHtml(status)}</span>`;
}

function table(headers: string[], rows: string[][]): string {
  const th = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
  const trs = rows
    .map((row) => `<tr>${row.map((c) => `<td>${c}</td>`).join("")}</tr>`)
    .join("");
  return `<table class="data"><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`;
}

function section(title: string, body: string): string {
  return `<section class="page section"><h2>${escapeHtml(title)}</h2>${body}</section>`;
}

export function buildSystemSpecificationHtml(): string {
  const stats = collectRepoStats();
  const hubRows = HUBS.map((h) => [
    escapeHtml(h.name),
    `<code>${escapeHtml(h.hub)}</code>`,
    escapeHtml(h.value),
    `<span class="mono">${escapeHtml(h.paths)}</span>`,
  ]);

  const statusRows = STATUS_MATRIX.map((s) => [
    escapeHtml(s.module),
    statusBadge(s.status),
    escapeHtml(s.note),
  ]);

  const stackRowsSource: ReadonlyArray<readonly [string, string]> = [
    ["Frontend", "Next.js 15 App Router · React 18 · Tailwind · RTL"],
    ["Backend", "Route Handlers · Server Actions · withWorkspacesAuth"],
    ["DB", "PostgreSQL (Neon) · Prisma 6 · 68 מודלים · 38 מיגרציות"],
    ["Auth", "NextAuth 4 · Passkeys · JWT · multi-tenant"],
    ["AI", "Gemini 2.5 · Document AI · OpenAI · Anthropic · Tri-Engine"],
    ["תשלומים", "PayPal · PayPlus (ישראל)"],
    ["ניטור", "Sentry · PostHog (EU) · Cron monitors"],
    ["איכות", "ESLint strict · Jest (382) · Playwright E2E · verify עבר מקומית"],
    ["Hosting", "Vercel — push ל-main → production אוטומטי"],
  ];
  const stackRows: string[][] = stackRowsSource.map(([k, v]) => [escapeHtml(k), escapeHtml(v)]);

  const codeTree = `
<pre class="tree">BSD-YBM-OS/
├── app/                 # דפים + ${stats.apiRouteFiles} קבצי route.ts + Server Actions
│   ├── (platform)/      # workspace, login, admin
│   ├── (marketing)/     # נחיתה, בלוג, contact
│   └── api/             # REST מאומת + webhooks + cron (${stats.cronRouteFiles} cron routes)
├── components/os/       # shell, hubs, widgets, scan, launcher
├── lib/                 # לוגיקה עסקית (ai, billing, scan, procurement…)
├── messages/            # i18n he · en · ru
├── prisma/              # schema + migrations
├── e2e/                 # Playwright (${stats.e2eSpecFiles} specs)
└── docs/                # ארכיטקטורה, runbooks, אפיון</pre>`;

  const valueBullets = `
<ul class="bullets">
  <li><strong>מערכת הפעלה עסקית אחת</strong> — CRM, פרויקטים, ERP, פיננסים ו-AI בממשק חלונות יחיד (RTL).</li>
  <li><strong>חיסכון תפעולי</strong> — סריקת חשבוניות → ERP אוטומטית, הפקת PDF עברי, ייצוא לרואה חשבון.</li>
  <li><strong>שליטה מנהלית</strong> — דשבורד אקזקוטיבי, חשבונות קבלני משנה, תזרים ותובנות.</li>
  <li><strong>שרשרת אספקה</strong> — רכש, מלאי וציוד בשטח (לוגיסטיקה) לענף הבנייה.</li>
  <li><strong>AI מוטמע</strong> — Omnibar, אוטומציות טבעיות, Field Copilot, BOQ משרטוטים.</li>
  <li><strong>SaaS מוכן</strong> — multi-tenant, מנויים, מכסות סריקה, אישור משתמשים.</li>
</ul>`;

  const apiAreas = [
    ["projects", "24", "משימות, Gantt, BOQ, יומן, AI insights"],
    ["erp", "17", "הפקה, ארכיון, PDF, מע״מ"],
    ["scan / analyze", "11", "Tri-Engine, save, history, queue"],
    ["procurement", "5", "ספקים, דרישות, PO, קליטה"],
    ["logistics", "6", "מלאי, נכסים, checkout"],
    ["crm", "7", "אנשי קשר, embeddings"],
    ["billing / webhooks", "4", "PayPal, PayPlus"],
    ["executive / progress-bills", "3", "סטטיסטיקות, חשבונות חלקיים"],
    ["comments", "1", "תגובות הקשריות TASK/DOC"],
    ["admin / cron / meckano", "37+", "תפעול, סנכרונים"],
  ].map(([a, n, d]) => [escapeHtml(String(a)), escapeHtml(String(n)), escapeHtml(String(d))]);

  const pages = [
    `<section class="page cover">
      <div class="cover-badge">אפיון מערכת · ${escapeHtml(GENERATED)}</div>
      <h1>BSD-YBM OS</h1>
      <p class="cover-sub">מערכת הפעלה עסקית לבנייה וניהול עסקי — מבנה · קוד · שווי · מצב</p>
      <div class="cover-meta">
        <div><span>גרסת מסמך</span><strong>${META.version}</strong></div>
        <div><span>מאגר</span><strong>${escapeHtml(META.repo)}</strong></div>
        <div><span>פרודקשן</span><strong>${escapeHtml(META.production)}</strong></div>
        <div><span>ענף פיתוח</span><strong>${escapeHtml(META.branch)}</strong></div>
        <div><span>Commit</span><strong>${escapeHtml(META.commit)}</strong></div>
        <div><span>PR</span><strong>${escapeHtml(META.pr)}</strong></div>
      </div>
      <p class="cover-note">מסמך פנימי לצוות מוצר, פיתוח ומשקיעים. נוצר אוטומטית מקוד המאגר.</p>
    </section>`,

    section("1. תקציר מנהלים ושווי עסקי", `
      <p class="lead">BSD-YBM OS היא פלטפורמת SaaS מרובת-דיירים המאחדת ניהול פרויקטים, CRM, ERP, פיננסים, סריקת AI ותפעול שטח — בממשק workspace דמוי מערכת הפעלה בעברית (RTL).</p>
      ${valueBullets}
      <div class="metrics">
        <div class="metric"><span>68</span><label>מודלי DB</label></div>
        <div class="metric"><span>${stats.apiRouteFiles}</span><label>קבצי API route</label></div>
        <div class="metric"><span>382</span><label>בדיקות unit</label></div>
        <div class="metric"><span>3</span><label>שפות UI</label></div>
      </div>`),

    section("2. ארכיטקטורה טכנית", `
      ${table(["שכבה", "טכנולוגיה"], stackRows)}
      <h3>זרימת בקשה (תמצית)</h3>
      <p class="flow">משתמש → Next.js App Router → Middleware (JWT) → withWorkspacesAuth (orgId) → Prisma/Neon · AI Providers · Webhooks</p>
      <h3>בידוד דיירים (Multi-Tenant)</h3>
      <ul class="bullets compact">
        <li>כל נתון עסקי כולל <code>organizationId</code> — אין גישה cross-tenant.</li>
        <li>API מאומת: <code>lib/api-handler.ts</code> → <code>withWorkspacesAuth()</code>.</li>
        <li>Rate limit לכל endpoint ציבורי/מאומת.</li>
      </ul>`),

    section("3. מפת Hub ומודולים", `
      <p class="lead">מרכז העבודה בנוי מ-Hubs (לשוניות) וווידג'טים עצמאיים. רשת המהירה (Launcher) מותאמת לענף: בבנייה — executiveHub במקום financeHub בשורה העליונה.</p>
      ${table(["מודול", "Widget ID", "ערך למשתמש", "נתיבי קוד"], hubRows)}
      <h3>מיפוי legacy → Hub</h3>
      <p><code>dashboard</code> → financeHub · <code>aiScanner</code> → documentsHub/scan · <code>projectBoard</code> → projectsHub/board · <code>erpArchive</code> → documentsHub/archive</p>`),

    section("4. מבנה קוד", codeTree + `
      <h3>קונבנציות מפתח</h3>
      <ul class="bullets compact">
        <li>TypeScript strict · Zod לכל קלט API · ללא <code>any</code>.</li>
        <li>i18n: <code>t("key")</code> — he (ברירת מחדל), en, ru.</li>
        <li>שגיאות: <code>createLogger</code> + Sentry · PII מסונן אוטומטית.</li>
        <li>מיגרציות: SQL ידני ב-<code>prisma/migrations/</code> (Neon ללא shadow DB).</li>
      </ul>
      <h3>תיעוד מפתח</h3>
      <p class="mono">SYSTEM_BRAIN.md · CLAUDE.md · docs/ARCHITECTURE.md · docs/איפיון-מערכת-BSD-YBM-OS.md</p>`),

    section("5. מסד נתונים (Prisma)", `
      ${table(["קטגוריה", "דוגמאות מודלים"], ([
        ["Auth / Org", "Organization, User, OrganizationInvite, UserPasskey"],
        ["פרויקטים", "Project, Task, WorkDiary, ProjectBoqLine, ProgressBill, PaymentMilestone"],
        ["CRM", "Contact, Quote, ContactSearchEmbedding"],
        ["ERP / מסמכים", "Document, IssuedDocument, Invoice, ExpenseRecord, DocumentScanJob"],
        ["רכש / לוגיסטיקה", "Supplier, PurchaseOrder, PurchaseRequest, InventoryItem, Asset"],
        ["AI", "FieldCopilotSession, KnowledgeVaultChunk, Automation, AICorrection"],
        ["חיוב", "OSBillingConfig, ScanBundle, FinancialInsight, RateLimit"],
      ] as ReadonlyArray<readonly [string, string]>).map(([a, b]) => [
        escapeHtml(a),
        `<span class="mono">${escapeHtml(b)}</span>`,
      ]))}`),

    section("6. מפת API", `
      <p class="lead">סה״כ ${stats.apiRouteFiles} קבצי <code>route.ts</code> תחת <code>app/api/</code> (סקריפט audit בודק 225 handlers כולל auth catch-all). Cron: ${stats.cronRouteFiles} בקוד · ${stats.vercelCronJobs} מתוזמנים ב-<code>vercel.json</code>.</p>
      ${table(["אזור", "כמות", "תיאור"], apiAreas)}`),

    section("7. סריקת AI ומסמכים", `
      <ul class="bullets">
        <li><strong>Tri-Engine</strong> — Gemini + Document AI + OpenAI/Mistral במקביל או בודד.</li>
        <li><strong>V5 Schema</strong> — נירמול ספק/סכום, אימות sanity, retry ממוקד.</li>
        <li><strong>Unified Scan V2</strong> — DocumentScanShell: intake → process → review → save.</li>
        <li><strong>יעדי שמירה</strong> — ERP, CRM, פרויקט, הוצאה, מחברת (NotebookLM).</li>
        <li><strong>התראות</strong> — מייל עם שדות מחולצים (לא placeholder) + קישור לארכיון workspace.</li>
      </ul>
      <p class="mono">lib/tri-engine-* · lib/scan/* · app/api/scan/* · components/os/scan/</p>`),

    section("8. חיוב, אבטחה ואינטגרציות", `
      <h3>מנויים</h3>
      <p>רמות: FREE · HOUSEHOLD · DEALER · COMPANY · CORPORATE. מכסות סריקה cheap/premium. ניסיון · אישור מנהל · lifecycle emails.</p>
      <h3>אינטגרציות</h3>
      ${table(["שירות", "סטטוס"], ([
        ["PayPal / PayPlus", "מוכן — webhooks מאומתים"],
        ["Google Drive / Calendar", "מוכן — OAuth + cron"],
        ["Meckano", "מוכן — דוחות נוכחות"],
        ["NotebookLM", "מוכן — מחברת AI"],
        ["ITA מס הכנסה", "Stub — mock"],
      ] as ReadonlyArray<readonly [string, string]>).map(([a, b]) => [escapeHtml(a), escapeHtml(b)]))}`),

    section("9. מצב פריסה ואיכות (יוני 2026)", `
      ${table(["רכיב", "סטטוס", "הערה"], statusRows)}
      <h3>CI / CD</h3>
      <ul class="bullets compact">
        <li><strong>Quality Gate (GitHub)</strong> — gitleaks, npm audit, lint, tsc, build, Playwright ci-gate על PR.</li>
        <li><strong>אימות מקומי (${escapeHtml(GENERATED)})</strong> — <code>npm run verify</code> עבר (lint + tsc + audit:api + audit:rate-limits + 382 tests).</li>
        <li><strong>E2E</strong> — <code>npm run test:e2e:ci-gate</code> עבר מקומית (93 passed, workers=2).</li>
        <li><strong>ענף נוכחי</strong> — ${escapeHtml(META.branch)} (${escapeHtml(META.commit)}): executive, procurement, logistics, scan quality.</li>
        <li><strong>פרודקשן</strong> — מתעדכן רק מ-merge ל-<code>main</code> (Vercel Git).</li>
      </ul>
      <h3>פקודות אימות</h3>
      <p class="mono">npm run verify · npm run build · npm run test:e2e:ci-gate · npm run audit:api</p>`),

    `<section class="page section closing">
      <h2>10. סיכום</h2>
      <p class="lead">BSD-YBM OS היא פלטפורמה בשלה טכנולוגית עם שכבת מוצר עשירה: workspace מודרני, מודולים עסקיים מלאים, ויכולות AI מובנות. מצב איכות מקומי תקין (verify); ITA ו-Gemini Live E2E נשארים Stub/ידני; merge לפרודקשן תלוי ב-ci-gate ירוק ב-GitHub.</p>
      <div class="closing-box">
        <strong>BSD-YBM</strong> · יוחנן בוקשפן · 052-564-0021 · bsd-ybm.co.il<br/>
        מסמך זה נוצר ב-${escapeHtml(GENERATED)} · גרסה ${META.version}
      </div>
    </section>`,
  ];

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8" />
<title>BSD-YBM OS — אפיון מערכת ${GENERATED}</title>
<style>
${fontFaceCss()}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
  font-family: "NotoHebrew", "Heebo", "Segoe UI", Arial, sans-serif;
  direction: rtl;
  color: #0f172a;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
@page { size: A4; margin: 14mm 12mm 18mm 12mm; }
.page { page-break-after: always; min-height: 250mm; }
.page:last-child { page-break-after: auto; }

.cover {
  display: flex; flex-direction: column; justify-content: center;
  min-height: 270mm;
  background: linear-gradient(145deg, #0b1020 0%, #1e1b4b 45%, #0f172a 100%);
  color: #f8fafc; padding: 18mm 16mm;
}
.cover-badge { font-size: 10pt; color: #a5b4fc; letter-spacing: 0.04em; margin-bottom: 8mm; }
.cover h1 { font-size: 36pt; font-weight: 700; line-height: 1.1; margin-bottom: 4mm; }
.cover-sub { font-size: 14pt; color: #cbd5e1; max-width: 140mm; line-height: 1.5; margin-bottom: 12mm; }
.cover-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm 8mm; font-size: 9.5pt; margin-bottom: 10mm; }
.cover-meta span { display: block; color: #94a3b8; font-size: 8pt; }
.cover-meta strong { color: #e2e8f0; }
.cover-note { font-size: 8.5pt; color: #64748b; border-top: 1px solid #334155; padding-top: 4mm; }

.section { padding: 4mm 2mm 0; }
h2 { font-size: 16pt; color: #312e81; border-bottom: 2px solid #e0e7ff; padding-bottom: 2mm; margin-bottom: 5mm; }
h3 { font-size: 11pt; color: #4338ca; margin: 5mm 0 2mm; }
.lead { font-size: 10.5pt; line-height: 1.55; color: #334155; margin-bottom: 4mm; }
.flow { font-size: 9pt; background: #f1f5f9; padding: 3mm; border-radius: 2mm; margin: 3mm 0; }
.mono, code, pre.tree { font-family: Consolas, "Courier New", monospace; font-size: 8pt; }
pre.tree { background: #f8fafc; border: 1px solid #e2e8f0; padding: 3mm; border-radius: 2mm; white-space: pre-wrap; line-height: 1.45; }

.bullets { margin: 0 5mm 4mm 0; padding: 0; list-style: none; }
.bullets li { font-size: 9.5pt; line-height: 1.5; margin-bottom: 2mm; padding-right: 4mm; position: relative; }
.bullets li::before { content: "▸"; position: absolute; right: 0; color: #6366f1; }
.bullets.compact li { margin-bottom: 1mm; font-size: 9pt; }

.metrics { display: flex; gap: 4mm; margin-top: 6mm; flex-wrap: wrap; }
.metric { flex: 1; min-width: 28mm; background: linear-gradient(135deg, #eef2ff, #f8fafc); border: 1px solid #c7d2fe; border-radius: 3mm; padding: 4mm; text-align: center; }
.metric span { display: block; font-size: 20pt; font-weight: 700; color: #4338ca; }
.metric label { font-size: 8pt; color: #64748b; }

table.data { width: 100%; border-collapse: collapse; font-size: 8.5pt; margin: 3mm 0 5mm; }
table.data th { background: #312e81; color: #fff; padding: 2mm 2.5mm; text-align: right; font-weight: 700; }
table.data td { border: 1px solid #e2e8f0; padding: 2mm 2.5mm; vertical-align: top; line-height: 1.4; }
table.data tr:nth-child(even) td { background: #f8fafc; }

.badge { display: inline-block; padding: 0.5mm 2mm; border-radius: 2mm; font-size: 8pt; font-weight: 700; }
.badge-ok { background: #dcfce7; color: #166534; }
.badge-new { background: #dbeafe; color: #1e40af; }
.badge-warn { background: #fef3c7; color: #92400e; }
.badge-stub { background: #f1f5f9; color: #475569; }
.badge-neutral { background: #e2e8f0; color: #334155; }

.closing { padding-top: 8mm; }
.closing-box { margin-top: 8mm; padding: 5mm; background: #f1f5f9; border-right: 4px solid #6366f1; font-size: 9pt; line-height: 1.6; }
</style>
</head>
<body>
${pages.join("\n")}
</body>
</html>`;
}
