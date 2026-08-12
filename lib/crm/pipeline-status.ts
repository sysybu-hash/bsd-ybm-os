/**
 * CRM sales pipeline statuses stored on Contact.status.
 *
 * Legacy mapping (UI lowercase + older DB values):
 *   lead / LEAD           → LEAD
 *   active / ACTIVE       → QUALIFIED  (engaged prospect, not yet closed)
 *   inactive              → LOST
 *   CLOSED_WON            → WON
 *   CLOSED_LOST           → LOST
 *   PROPOSAL              → PROPOSAL (unchanged)
 */
export const CRM_PIPELINE_STATUSES = [
  "LEAD",
  "QUALIFIED",
  "PROPOSAL",
  "WON",
  "LOST",
] as const;

export type CrmPipelineStatus = (typeof CRM_PIPELINE_STATUSES)[number];

const LEGACY_STATUS_MAP: Record<string, CrmPipelineStatus> = {
  lead: "LEAD",
  active: "QUALIFIED",
  inactive: "LOST",
  LEAD: "LEAD",
  QUALIFIED: "QUALIFIED",
  PROPOSAL: "PROPOSAL",
  WON: "WON",
  LOST: "LOST",
  ACTIVE: "QUALIFIED",
  CLOSED_WON: "WON",
  CLOSED_LOST: "LOST",
};

/** Normalize any stored or form status to a pipeline status for UI. */
export function normalizeContactStatus(raw: string | null | undefined): CrmPipelineStatus {
  const key = String(raw ?? "LEAD").trim();
  const lower = key.toLowerCase();
  return LEGACY_STATUS_MAP[key] ?? LEGACY_STATUS_MAP[lower] ?? "LEAD";
}

/** Persist pipeline status (accepts legacy input, stores canonical pipeline value). */
export function serializeContactStatus(raw: string | null | undefined): CrmPipelineStatus {
  return normalizeContactStatus(raw);
}

export function isClosedPipelineStatus(status: CrmPipelineStatus): boolean {
  return status === "WON" || status === "LOST";
}

export function isWonPipelineStatus(status: string): boolean {
  const normalized = normalizeContactStatus(status);
  return normalized === "WON";
}

export function isLostPipelineStatus(status: string): boolean {
  const normalized = normalizeContactStatus(status);
  return normalized === "LOST";
}
