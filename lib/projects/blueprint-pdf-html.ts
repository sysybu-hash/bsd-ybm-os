import { escapeHtml } from "@/lib/pdf/invoice-labels";
import { loadPdfFontBuffers } from "@/lib/pdf/load-pdf-font-buffers";
import type { BlueprintAnalysis } from "@/lib/projects/blueprint-analysis-schema";

function fontFaceCss(): string {
  const { regular, bold } = loadPdfFontBuffers();
  return `
@font-face { font-family: "NotoHebrew"; font-weight: 400;
  src: url(data:font/ttf;base64,${regular.toString("base64")}) format("truetype"); }
@font-face { font-family: "NotoHebrew"; font-weight: 700;
  src: url(data:font/ttf;base64,${bold.toString("base64")}) format("truetype"); }`;
}

export function buildBlueprintPdfHtml(analysis: BlueprintAnalysis, projectName?: string): string {
  const fonts = fontFaceCss();
  const date = new Date().toLocaleDateString("he-IL");
  const title = escapeHtml(projectName ?? "גרמושקה");

  const tasksHtml = analysis.tasks.length > 0 ? `
<h2>משימות לגנט</h2>
<table>
  <thead><tr><th>שם משימה</th><th>תחילה</th><th>סיום</th></tr></thead>
  <tbody>
    ${analysis.tasks.map((t) => `<tr>
      <td>${escapeHtml(t.name)}</td>
      <td>${escapeHtml(t.startDate ?? "")}</td>
      <td>${escapeHtml(t.endDate ?? "")}</td>
    </tr>`).join("")}
  </tbody>
</table>` : "";

  const milestonesHtml = analysis.milestones.length > 0 ? `
<h2>אבני דרך ותשלום</h2>
<table>
  <thead><tr><th>תיאור שלב</th><th>אחוז</th><th>סכום ₪</th></tr></thead>
  <tbody>
    ${analysis.milestones.map((m) => {
      const pct = m.percent != null ? String(m.percent) + "%" : "";
      const amt = m.amount != null ? String(m.amount) : "";
      return `<tr>
        <td>${escapeHtml(m.name)}</td>
        <td>${escapeHtml(pct)}</td>
        <td>${escapeHtml(amt)}</td>
      </tr>`;
    }).join("")}
  </tbody>
</table>` : "";

  const boqHtml = analysis.boqLineItems.length > 0 ? `
<h2>כתב כמויות</h2>
<table>
  <thead><tr><th>תיאור סעיף</th><th>יחידה</th><th>כמות</th><th>הערה</th></tr></thead>
  <tbody>
    ${analysis.boqLineItems.map((b) => `<tr>
      <td>${escapeHtml(b.description)}</td>
      <td>${escapeHtml(b.unit ?? "")}</td>
      <td>${escapeHtml(b.quantity != null ? String(b.quantity) : "")}</td>
      <td>${escapeHtml(b.note ?? "")}</td>
    </tr>`).join("")}
  </tbody>
</table>` : "";

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8"/>
<style>
${fonts}
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: "NotoHebrew","Arial",sans-serif; font-size: 11px; direction: rtl; padding: 24px; color: #1a1a1a; }
h1 { font-size: 16px; font-weight: 700; margin-bottom: 4px; }
.meta { font-size: 10px; color: #555; margin-bottom: 18px; }
h2 { font-size: 13px; font-weight: 700; margin: 16px 0 6px; border-bottom: 1px solid #ccc; padding-bottom: 3px; }
table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
th { background: #f4f4f4; font-weight: 700; text-align: right; padding: 5px 7px; border: 1px solid #ddd; }
td { padding: 4px 7px; border: 1px solid #ddd; vertical-align: top; }
tr:nth-child(even) td { background: #fafafa; }
</style>
</head>
<body>
<h1>${title}</h1>
<div class="meta">תאריך הפקה: ${escapeHtml(date)}</div>
${tasksHtml}
${milestonesHtml}
${boqHtml}
</body>
</html>`;
}
