import { logActivity } from "@/lib/activity-log";

const ACTION_PREFIX = "ISSUED_DOC";

export type IssuedDocumentAuditAction = "created" | "sent" | "voided";

export async function logIssuedDocumentAudit(
  userId: string,
  organizationId: string,
  action: IssuedDocumentAuditAction,
  details: string,
): Promise<void> {
  await logActivity(userId, organizationId, `${ACTION_PREFIX}:${action}`, details);
}

export function issuedDocumentAuditDetails(
  parts: Record<string, string | number | null | undefined>,
): string {
  return Object.entries(parts)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(";");
}
