import type { ScanExtractionV5 } from "@/lib/scan-schema-v5";
import type { TriEngineTelemetry } from "@/lib/tri-engine-extract";

export type NotebookSourceInput = {
  name: string;
  content: string;
  mimeType?: string;
};

export function formatScanSummaryMarkdown(v5: ScanExtractionV5, fileName: string): string {
  const lines: string[] = [`# סריקה: ${fileName}`, ""];
  if (v5.docType) lines.push(`**סוג מסמך:** ${v5.docType}`);
  if (v5.vendor) lines.push(`**ספק:** ${v5.vendor}`);
  if (v5.taxId) lines.push(`**ח.פ / עוסק:** ${v5.taxId}`);
  if (v5.date) lines.push(`**תאריך:** ${v5.date}`);
  if (v5.total != null) lines.push(`**סה״כ:** ${v5.total}`);
  if (v5.summary) lines.push("", v5.summary);
  if (v5.lineItems?.length) {
    lines.push("", "## שורות", "");
    for (const row of v5.lineItems) {
      lines.push(`- ${row.description ?? ""}: ${row.quantity ?? 1} × ${row.unitPrice ?? row.lineTotal ?? ""}`);
    }
  }
  return lines.join("\n");
}

export function buildNotebookSourcesFromScan(input: {
  fileName: string;
  mimeType?: string;
  v5: ScanExtractionV5;
  telemetry?: TriEngineTelemetry | null;
  extractedText?: string | null;
}): NotebookSourceInput[] {
  const { fileName, v5, telemetry, extractedText } = input;
  const sources: NotebookSourceInput[] = [
    {
      name: `סריקה: ${fileName}`,
      content: formatScanSummaryMarkdown(v5, fileName),
      mimeType: "text/markdown",
    },
    {
      name: `נתונים מובנים — ${fileName}`,
      content: JSON.stringify({ v5, telemetry: telemetry ?? null }, null, 2),
      mimeType: "application/json",
    },
  ];
  if (extractedText?.trim()) {
    sources.push({
      name: `טקסט מקור — ${fileName}`,
      content: extractedText.trim().slice(0, 120_000),
      mimeType: "text/plain",
    });
  }
  return sources;
}

export const LAST_SCAN_STORAGE_KEY = "bsd_last_scan_payload";
