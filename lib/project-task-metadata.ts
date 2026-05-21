import type { ProjectSubDomainId } from "@/lib/project-sub-domains";
import { PROJECT_SUB_DOMAIN_BY_ID } from "@/lib/project-sub-domains";

const TRADE_LINE_RE = /^trade:([A-Z_]+)\s*$/m;
const TRADE_INLINE_RE = /^trade:([A-Z_]+)\n/;
const BOQ_LINE_RE = /^boq:([a-z0-9]+)\s*$/m;
const BOQ_INLINE_RE = /^boq:([a-z0-9]+)\n/;

export function getTaskBoqLineId(description: string | null | undefined): string | null {
  if (!description) return null;
  const line = description.match(BOQ_LINE_RE);
  if (line) return line[1] ?? null;
  const inline = description.match(BOQ_INLINE_RE);
  return inline ? (inline[1] ?? null) : null;
}

export function getTaskTradeId(description: string | null | undefined): ProjectSubDomainId | null {
  if (!description) return null;
  const line = description.match(TRADE_LINE_RE);
  if (line) {
    const id = (line[1] ?? "") as ProjectSubDomainId;
    return PROJECT_SUB_DOMAIN_BY_ID[id] ? id : null;
  }
  const inline = description.match(TRADE_INLINE_RE);
  if (inline) {
    const id = (inline[1] ?? "") as ProjectSubDomainId;
    return PROJECT_SUB_DOMAIN_BY_ID[id] ? id : null;
  }
  return null;
}

export function getTaskTradeNotes(description: string | null | undefined): string {
  if (!description) return "";
  return description
    .replace(TRADE_LINE_RE, "")
    .replace(TRADE_INLINE_RE, "")
    .replace(BOQ_LINE_RE, "")
    .replace(BOQ_INLINE_RE, "")
    .trim();
}

export function buildTaskDescription(opts: {
  tradeId?: ProjectSubDomainId | null;
  linkedBoqLineId?: string | null;
  notes?: string | null;
}): string | null {
  const parts: string[] = [];
  if (opts.tradeId) parts.push(`trade:${opts.tradeId}`);
  if (opts.linkedBoqLineId) parts.push(`boq:${opts.linkedBoqLineId}`);
  const notes = (opts.notes ?? "").trim();
  if (notes) parts.push(notes);
  return parts.length ? parts.join("\n") : null;
}

/** ממזג ערך DB (עמודה) עם מטא-דאטה בתיאור */
export function resolveLinkedBoqLineId(
  columnValue: string | null | undefined,
  description: string | null | undefined,
): string | null {
  return columnValue ?? getTaskBoqLineId(description);
}
