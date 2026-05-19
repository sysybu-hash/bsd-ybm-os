import { loadPdfFontBuffers } from "@/lib/pdf/load-pdf-font-buffers";
import { escapeHtml } from "@/lib/pdf/invoice-labels";

export type MeckanoReportRow = {
  date: string;
  employeeName: string;
  project: string;
  location: string;
  hours: number;
};

export type MeckanoReportPayload = {
  startDate: string;
  endDate: string;
  organizationName?: string;
  rows: MeckanoReportRow[];
};

function fontFaceCss(): string {
  const { regular, bold } = loadPdfFontBuffers();
  return `
@font-face {
  font-family: "NotoHebrew";
  font-style: normal;
  font-weight: 400;
  src: url(data:font/ttf;base64,${regular.toString("base64")}) format("truetype");
}
@font-face {
  font-family: "NotoHebrew";
  font-style: normal;
  font-weight: 700;
  src: url(data:font/ttf;base64,${bold.toString("base64")}) format("truetype");
}`;
}

export function buildMeckanoReportHtml(payload: MeckanoReportPayload): string {
  const totalHours = payload.rows.reduce((acc, r) => acc + (Number.isFinite(r.hours) ? r.hours : 0), 0);
  const totalRows = payload.rows.length;

  const rowsHtml = payload.rows
    .map(
      (r) => `
      <tr>
        <td>${escapeHtml(r.date)}</td>
        <td>${escapeHtml(r.employeeName)}</td>
        <td>${escapeHtml(r.project)}</td>
        <td>${escapeHtml(r.location)}</td>
        <td class="num">${escapeHtml(String(r.hours))}</td>
      </tr>`,
    )
    .join("");

  const today = new Date().toLocaleDateString("he-IL");

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8" />
<title>דוח נוכחות Meckano</title>
<style>
${fontFaceCss()}
* { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  font-family: "NotoHebrew", "Heebo", "Segoe UI", Arial, sans-serif;
  color: #0b1220;
  background: #fff;
  direction: rtl;
}
body { padding: 24px 8px; }
.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  border-bottom: 2px solid #10b981;
  padding-bottom: 12px;
  margin-bottom: 16px;
}
.header h1 { margin: 0; font-size: 22px; }
.header .meta { font-size: 12px; color: #4b5563; text-align: left; }
.summary {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.summary .card {
  flex: 1 1 160px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 10px 14px;
  background: #f9fafb;
}
.summary .label { font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.08em; }
.summary .value { font-size: 18px; font-weight: 700; color: #0b1220; margin-top: 2px; }
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}
th, td {
  border: 1px solid #e5e7eb;
  padding: 6px 8px;
  text-align: right;
  vertical-align: top;
}
th {
  background: #10b981;
  color: white;
  font-weight: 700;
  font-size: 11px;
}
tr:nth-child(even) td { background: #f9fafb; }
.num { text-align: left; font-variant-numeric: tabular-nums; }
.footer {
  margin-top: 20px;
  font-size: 10px;
  color: #6b7280;
  text-align: center;
}
@page { size: A4 landscape; margin: 12mm; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <h1>דוח נוכחות Meckano</h1>
      <div style="font-size: 12px; color: #4b5563;">
        טווח תאריכים: ${escapeHtml(payload.startDate)} עד ${escapeHtml(payload.endDate)}
      </div>
    </div>
    <div class="meta">
      ${payload.organizationName ? escapeHtml(payload.organizationName) + "<br/>" : ""}
      הופק ב-${escapeHtml(today)}
    </div>
  </div>

  <div class="summary">
    <div class="card">
      <div class="label">סך רישומים</div>
      <div class="value">${totalRows}</div>
    </div>
    <div class="card">
      <div class="label">סך שעות</div>
      <div class="value">${totalHours.toFixed(2)}</div>
    </div>
  </div>

  ${
    payload.rows.length === 0
      ? '<div style="text-align: center; padding: 40px; color: #6b7280;">אין נתונים להצגה לטווח שנבחר.</div>'
      : `<table>
          <thead>
            <tr>
              <th>תאריך</th>
              <th>עובד</th>
              <th>פרויקט</th>
              <th>מיקום</th>
              <th>שעות</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>`
  }

  <div class="footer">BSD-YBM OS · דוח Meckano</div>
</body>
</html>`;
}
