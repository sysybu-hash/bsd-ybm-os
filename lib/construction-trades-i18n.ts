import type { MessageTree } from "@/lib/i18n/keys";
import type { AnalysisType, IndustryConfig } from "@/lib/professions/config";

/** תואם ל־TradeIssueTemplate בלי ייבוא מעגלי */
export type TradeTemplateRow = {
  id: string;
  label: string;
  description: string;
  kind: "OFFICIAL" | "APPROVAL" | "FORM" | "REPORT";
  issuedDocumentType?: "INVOICE" | "RECEIPT" | "INVOICE_RECEIPT" | "CREDIT_NOTE";
};

export type TradeProfileForI18n = {
  clientsLabel: string;
  documentsLabel: string;
  recordsLabel: string;
  homeTitle: string;
  homeDescription: string;
  templates: TradeTemplateRow[];
};

function tradeNode(messages: MessageTree | undefined, trade: string): Record<string, unknown> | undefined {
  if (!messages) return undefined;
  const root = messages as unknown as Record<string, unknown>;
  const pack = root.constructionTrades;
  if (!pack || typeof pack !== "object" || Array.isArray(pack)) return undefined;
  const t = (pack as Record<string, unknown>)[trade];
  return t && typeof t === "object" && !Array.isArray(t) ? (t as Record<string, unknown>) : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

export function mergeTradeProfileFromMessages(
  messages: MessageTree | undefined,
  trade: string,
  code: TradeProfileForI18n,
): TradeProfileForI18n {
  const n = tradeNode(messages, trade);
  if (!n) return code;

  const templatesJson = n.templates;
  const mergedTemplates = mergeTemplates(code.templates, templatesJson);

  return {
    clientsLabel: str(n.clientsLabel) ?? code.clientsLabel,
    documentsLabel: str(n.documentsLabel) ?? code.documentsLabel,
    recordsLabel: str(n.recordsLabel) ?? code.recordsLabel,
    homeTitle: str(n.homeTitle) ?? code.homeTitle,
    homeDescription: str(n.homeDescription) ?? code.homeDescription,
    templates: mergedTemplates,
  };
}

function mergeTemplates(code: TradeTemplateRow[], json: unknown): TradeTemplateRow[] {
  if (!Array.isArray(json)) return code;
  const byId = new Map<string, Record<string, unknown>>();
  for (const row of json) {
    if (row && typeof row === "object" && !Array.isArray(row) && typeof (row as { id?: unknown }).id === "string") {
      byId.set(String((row as { id: string }).id), row as Record<string, unknown>);
    }
  }
  return code.map((t) => {
    const j = byId.get(t.id);
    if (!j) return t;
    const kind = str(j.kind);
    const issued = str(j.issuedDocumentType);
    return {
      ...t,
      label: str(j.label) ?? t.label,
      description: str(j.description) ?? t.description,
      kind: kind === "OFFICIAL" || kind === "APPROVAL" || kind === "FORM" || kind === "REPORT" ? kind : t.kind,
      issuedDocumentType:
        issued === "INVOICE" || issued === "RECEIPT" || issued === "INVOICE_RECEIPT" || issued === "CREDIT_NOTE"
          ? issued
          : t.issuedDocumentType,
    };
  });
}

export function mergeTradeVocabularyFromMessages(
  messages: MessageTree | undefined,
  trade: string,
  code: IndustryConfig["vocabulary"],
): IndustryConfig["vocabulary"] {
  const n = tradeNode(messages, trade);
  const voc = n?.vocabulary;
  if (!voc || typeof voc !== "object" || Array.isArray(voc)) return code;
  const v = voc as Record<string, unknown>;
  return {
    ...code,
    client: str(v.client) ?? code.client,
    project: str(v.project) ?? code.project,
    document: str(v.document) ?? code.document,
    inventory: str(v.inventory) ?? code.inventory,
  };
}

export function mergeScannerShellFromMessages(
  messages: MessageTree | undefined,
  trade: string,
  scanner: IndustryConfig["scanner"],
): IndustryConfig["scanner"] {
  const n = tradeNode(messages, trade);
  const sc = n?.scanner;
  if (!sc || typeof sc !== "object" || Array.isArray(sc)) return scanner;
  const s = sc as Record<string, unknown>;
  return {
    ...scanner,
    title: str(s.title) ?? scanner.title,
    subtitle: str(s.subtitle) ?? scanner.subtitle,
    dropzoneTitle: str(s.dropzoneTitle) ?? scanner.dropzoneTitle,
    dropzoneSub: str(s.dropzoneSub) ?? scanner.dropzoneSub,
  };
}

/** תווית מקצוע ליד שם הענף — מתוך constructionTradeLabels בקבצי שפה */
export function mergeConstructionTradeLabel(
  messages: MessageTree | undefined,
  trade: string,
  fallbackHe: string,
): string {
  if (!messages) return fallbackHe;
  const root = messages as unknown as Record<string, unknown>;
  const map = root.constructionTradeLabels;
  if (!map || typeof map !== "object" || Array.isArray(map)) return fallbackHe;
  const s = (map as Record<string, unknown>)[trade];
  return typeof s === "string" && s.trim() ? s.trim() : fallbackHe;
}

/** תוויות עמודות תוצאות סורק — ב־JSON: resultColumns: { "columnKey": "Label" } */
export function mergeResultColumnsFromMessages(
  messages: MessageTree | undefined,
  trade: string,
  columns: { key: string; label: string }[],
): { key: string; label: string }[] {
  const n = tradeNode(messages, trade);
  const rc = n?.resultColumns;
  if (!rc || typeof rc !== "object" || Array.isArray(rc)) return columns;
  const map = rc as Record<string, unknown>;
  return columns.map((row) => {
    const slot = map[row.key];
    if (typeof slot === "string" && slot.trim()) return { ...row, label: slot.trim() };
    return row;
  });
}

export function mergeAnalysisTypesFromMessages(
  messages: MessageTree | undefined,
  trade: string,
  types: AnalysisType[],
): AnalysisType[] {
  const n = tradeNode(messages, trade);
  const at = n?.analysisTypes;
  if (!at || typeof at !== "object" || Array.isArray(at)) return types;
  const map = at as Record<string, unknown>;
  return types.map((row) => {
    const slot = map[row.id];
    if (!slot || typeof slot !== "object" || Array.isArray(slot)) return row;
    const o = slot as Record<string, unknown>;
    return {
      ...row,
      label: str(o.label) ?? row.label,
      description: str(o.description) ?? row.description,
      promptExtra: str(o.promptExtra) ?? row.promptExtra,
    };
  });
}
