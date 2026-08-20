import { v1 } from "@google-cloud/documentai";
import { env } from "@/lib/env";
import type { ScanModeV5 } from "@/lib/scan-schema-v5";

const { DocumentProcessorServiceClient } = v1;

type ServiceAccountCredentials = {
  project_id?: string;
};

export type DocAiProcessorKind = "OCR" | "EXPENSE" | "INVOICE" | "FORM";

const DOC_AI_PROCESSORS: Record<DocAiProcessorKind, { env: string; nameEnv: string; label: string; consoleType: string; defaultNames: string[] }> = {
  OCR: {
    env: "GOOGLE_DOCUMENT_AI_OCR_PROCESSOR_ID",
    nameEnv: "GOOGLE_DOCUMENT_AI_OCR_PROCESSOR_NAME",
    label: "Document OCR",
    consoleType: "OCR_PROCESSOR",
    defaultNames: ["bsd-ybm"],
  },
  EXPENSE: {
    env: "GOOGLE_DOCUMENT_AI_EXPENSE_PROCESSOR_ID",
    nameEnv: "GOOGLE_DOCUMENT_AI_EXPENSE_PROCESSOR_NAME",
    label: "Expense Parser",
    consoleType: "EXPENSE_PROCESSOR",
    defaultNames: ["bsd-ybm Expense Parser"],
  },
  INVOICE: {
    env: "GOOGLE_DOCUMENT_AI_INVOICE_PROCESSOR_ID",
    nameEnv: "GOOGLE_DOCUMENT_AI_INVOICE_PROCESSOR_NAME",
    label: "Invoice Parser",
    consoleType: "INVOICE_PROCESSOR",
    defaultNames: ["bsd-ybm invoice"],
  },
  FORM: {
    env: "GOOGLE_DOCUMENT_AI_FORM_PROCESSOR_ID",
    nameEnv: "GOOGLE_DOCUMENT_AI_FORM_PROCESSOR_NAME",
    label: "Form Parser",
    consoleType: "FORM_PARSER_PROCESSOR",
    defaultNames: ["bsd-ybm", "bsd-ybm Form Parser"],
  },
};

function resolveDocAiProcessorRaw(kind: DocAiProcessorKind): string {
  return process.env[DOC_AI_PROCESSORS[kind].env]?.trim() || "";
}

export function getDocAiProcessorConfigs() {
  return (Object.keys(DOC_AI_PROCESSORS) as DocAiProcessorKind[]).map((kind) => ({
    kind,
    ...DOC_AI_PROCESSORS[kind],
    configured: Boolean(resolveDocAiProcessorRaw(kind) || env.GOOGLE_DOCUMENT_AI_PROCESSOR_ID?.trim()),
  }));
}

export function isAnyDocAiProcessorConfigured(): boolean {
  return getDocAiProcessorConfigs().some((processor) => processor.configured);
}

export function isDocAiProcessorConfigured(kind: DocAiProcessorKind): boolean {
  return Boolean(resolveDocAiProcessorRaw(kind) || env.GOOGLE_DOCUMENT_AI_PROCESSOR_ID?.trim());
}

export function docAiProcessorFallbackOrder(scanMode: ScanModeV5): DocAiProcessorKind[] {
  if (scanMode === "INVOICE_FINANCIAL") return ["INVOICE", "EXPENSE", "FORM", "OCR"];
  if (scanMode === "DRAWING_BOQ") return ["FORM", "OCR"];
  return ["FORM", "OCR", "INVOICE", "EXPENSE"];
}

/**
 * שם משאב מלא: projects/PROJECT/locations/REGION/processors/PROCESSOR_ID
 * אם הוגדר רק מזהה המעבד (למשל hex) — בונים מהפרויקט והאזור.
 */
function resolveDocAiProcessorResourceName(
  raw: string,
  credentials: ServiceAccountCredentials,
): string {
  const t = raw.trim();
  if (t.startsWith("projects/") && t.includes("/processors/")) {
    return t;
  }

  const projectId =
    env.GOOGLE_DOCUMENT_AI_PROJECT_ID?.trim() ||
    credentials.project_id?.trim() ||
    env.GOOGLE_CLOUD_PROJECT?.trim() ||
    env.GCLOUD_PROJECT?.trim() ||
    env.GOOGLE_CLOUD_PROJECT_ID?.trim();

  const location =
    env.GOOGLE_DOCUMENT_AI_LOCATION?.trim() ||
    env.GOOGLE_CLOUD_LOCATION?.trim() ||
    "us";

  if (!projectId) {
    throw new Error(
      "Document AI: הגדירו GOOGLE_DOCUMENT_AI_PROCESSOR_ID כשם משאב מלא (projects/.../processors/...), או מזהה מעבד קצר יחד עם project_id ב-JSON של חשבון השירות / GOOGLE_DOCUMENT_AI_PROJECT_ID.",
    );
  }

  const idOnly = t.replace(/^processors\//, "");
  return `projects/${projectId}/locations/${location}/processors/${idOnly}`;
}

function resolveDocAiProjectId(credentials: ServiceAccountCredentials): string {
  const projectId =
    env.GOOGLE_DOCUMENT_AI_PROJECT_ID?.trim() ||
    credentials.project_id?.trim() ||
    env.GOOGLE_CLOUD_PROJECT?.trim() ||
    env.GCLOUD_PROJECT?.trim() ||
    env.GOOGLE_CLOUD_PROJECT_ID?.trim();
  if (!projectId) {
    throw new Error("Document AI: missing project id for processor auto-discovery.");
  }
  return projectId;
}

function resolveDocAiLocation(): string {
  return env.GOOGLE_DOCUMENT_AI_LOCATION?.trim() || env.GOOGLE_CLOUD_LOCATION?.trim() || "us";
}

async function discoverDocAiProcessorResourceName(
  client: InstanceType<typeof DocumentProcessorServiceClient>,
  credentials: ServiceAccountCredentials,
  kind: DocAiProcessorKind,
): Promise<string | null> {
  const projectId = resolveDocAiProjectId(credentials);
  const location = resolveDocAiLocation();
  const parent = `projects/${projectId}/locations/${location}`;
  const configuredName = process.env[DOC_AI_PROCESSORS[kind].nameEnv]?.trim();
  const desiredNames = [configuredName, ...DOC_AI_PROCESSORS[kind].defaultNames]
    .filter(Boolean)
    .map((name) => String(name).toLowerCase());
  const [processors] = await client.listProcessors({ parent });
  const exact = processors.find((processor) => {
    const displayName = String(processor.displayName ?? "").toLowerCase();
    const type = String(processor.type ?? "");
    return desiredNames.includes(displayName) && (!type || type === DOC_AI_PROCESSORS[kind].consoleType);
  });
  const byType = processors.find((processor) => String(processor.type ?? "") === DOC_AI_PROCESSORS[kind].consoleType);
  return exact?.name ?? byType?.name ?? null;
}

function simplifyDocAiProperties(props: unknown): Record<string, unknown> {
  if (!props || typeof props !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props as Record<string, unknown>)) {
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      const nv = o.normalizedValue;
      const text =
        nv && typeof nv === "object" && nv !== null && "text" in nv
          ? String((nv as { text?: string }).text ?? "")
          : "";
      out[k] = text.trim() || o.mentionText || null;
    }
  }
  return out;
}

export type DocAiRawEntity = {
  type?: string | null;
  mentionText?: string | null;
  confidence?: number | null;
  normalizedValue?: string | null;
  properties?: Record<string, unknown>;
};

export type DocAiFormField = {
  name: string;
  value: string;
  confidence?: number | null;
};

export type DocAiTable = {
  rows: string[][];
};

export type DocAiRawResult = {
  fullText: string;
  entities: DocAiRawEntity[];
  formFields: DocAiFormField[];
  tables: DocAiTable[];
  processorKind: DocAiProcessorKind;
  processorResourceName: string;
};

function textFromAnchor(anchor: unknown, fullText: string): string {
  if (!anchor || typeof anchor !== "object") return "";
  const segments = (anchor as { textSegments?: Array<{ startIndex?: string | number; endIndex?: string | number }> })
    .textSegments;
  if (!Array.isArray(segments)) return "";
  return segments
    .map((segment) => {
      const start = Number(segment.startIndex ?? 0);
      const end = Number(segment.endIndex ?? start);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return "";
      return fullText.slice(start, end);
    })
    .join("")
    .trim();
}

function simplifyDocAiFormFields(pages: unknown, fullText: string): DocAiFormField[] {
  if (!Array.isArray(pages)) return [];
  const out: DocAiFormField[] = [];
  for (const page of pages) {
    const fields = (page as { formFields?: unknown[] })?.formFields;
    if (!Array.isArray(fields)) continue;
    for (const field of fields) {
      const f = field as {
        fieldName?: { textAnchor?: unknown };
        fieldValue?: { textAnchor?: unknown };
        value?: string;
        confidence?: number | null;
      };
      const name = textFromAnchor(f.fieldName?.textAnchor, fullText);
      const value = textFromAnchor(f.fieldValue?.textAnchor, fullText) || String(f.value ?? "").trim();
      if (name || value) out.push({ name, value, confidence: f.confidence ?? null });
    }
  }
  return out;
}

function simplifyDocAiTables(pages: unknown, fullText: string): DocAiTable[] {
  if (!Array.isArray(pages)) return [];
  const out: DocAiTable[] = [];
  for (const page of pages) {
    const tables = (page as { tables?: unknown[] })?.tables;
    if (!Array.isArray(tables)) continue;
    for (const table of tables) {
      const t = table as { headerRows?: unknown[]; bodyRows?: unknown[] };
      const rowGroups = [...(t.headerRows ?? []), ...(t.bodyRows ?? [])];
      const rows = rowGroups
        .map((row) => {
          const cells = (row as { cells?: unknown[] })?.cells;
          if (!Array.isArray(cells)) return [];
          return cells.map((cell) =>
            textFromAnchor((cell as { layout?: { textAnchor?: unknown } }).layout?.textAnchor, fullText),
          );
        })
        .filter((row) => row.some(Boolean));
      if (rows.length) out.push({ rows });
    }
  }
  return out;
}

/**
 * הרצת Document AI בלבד — טקסט + ישויות (למיפוי פיננסי ישיר ול-Tri-Engine).
 */
export {
  DOC_AI_PROCESSORS,
  resolveDocAiProcessorRaw,
  resolveDocAiProcessorResourceName,
  resolveDocAiLocation,
  resolveDocAiProjectId,
  discoverDocAiProcessorResourceName,
  simplifyDocAiProperties,
  simplifyDocAiFormFields,
  simplifyDocAiTables,
};
