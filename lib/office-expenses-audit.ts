import { logActivity } from "@/lib/activity-log";

const ACTION_PREFIX = "OFFICE_EXPENSE";

export type OfficeExpenseAuditAction = "created" | "updated" | "deleted" | "scan_created";

export async function logOfficeExpenseAudit(
  userId: string,
  organizationId: string,
  action: OfficeExpenseAuditAction,
  details: string,
): Promise<void> {
  await logActivity(userId, organizationId, `${ACTION_PREFIX}:${action}`, details);
}

export function officeExpenseAuditDetails(parts: Record<string, string | number | null | undefined>): string {
  return Object.entries(parts)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(";");
}
