import { tierLabelHe } from "@/lib/subscription-tier-config";

export type WorkspaceAccessContext = {
  role?: string | null;
  isOSAdmin?: boolean;
  subscriptionTier?: string | null;
  subscriptionStatus?: string | null;
  hasOrganization?: boolean;
  hasMeckanoAccess?: boolean;
};

function normalizeRole(role: string | null | undefined) {
  return String(role ?? "").trim().toUpperCase();
}

function normalizeStatus(status: string | null | undefined) {
  return String(status ?? "").trim().toUpperCase();
}

export function isOrgAdminRole(role: string | null | undefined): boolean {
  const normalized = normalizeRole(role);
  return normalized === "ORG_ADMIN" || normalized === "SUPER_ADMIN";
}

export function isWorkspaceManagerRole(role: string | null | undefined): boolean {
  const normalized = normalizeRole(role);
  return normalized === "SUPER_ADMIN" || normalized === "ORG_ADMIN" || normalized === "PROJECT_MGR";
}

export function canManageOrganization(context: WorkspaceAccessContext): boolean {
  return Boolean(context.isOSAdmin) || isOrgAdminRole(context.role);
}

export function canAccessOSAdmin(context: WorkspaceAccessContext): boolean {
  return Boolean(context.isOSAdmin);
}

export function canAccessOSBillingControl(context: WorkspaceAccessContext): boolean {
  return canAccessOSAdmin(context);
}

export function hasActiveWorkspaceSubscription(status: string | null | undefined): boolean {
  const normalized = normalizeStatus(status);
  return normalized === "ACTIVE" || normalized === "TRIAL" || normalized === "PENDING_APPROVAL";
}

export function getWorkspaceRoleLabel(context: WorkspaceAccessContext): string {
  if (context.isOSAdmin) return "מנהל BSD-YBM-OS";

  switch (normalizeRole(context.role)) {
    case "ORG_ADMIN":
      return "מנהל ארגון";
    case "PROJECT_MGR":
      return "מנהל פרויקט";
    case "EMPLOYEE":
      return "עובד צוות";
    case "CLIENT":
      return "מנוי";
    case "SUPER_ADMIN":
      return "מנהל מערכת";
    default:
      return "משתמש";
  }
}

export function getWorkspaceModeLabel(context: WorkspaceAccessContext): string {
  return canManageOrganization(context) ? "ניהול" : "צפייה";
}

export function getWorkspaceTierLabel(context: WorkspaceAccessContext): string {
  if (!context.subscriptionTier) return "ללא מנוי";
  return tierLabelHe(context.subscriptionTier);
}

export function getSubscriptionStatusLabel(status: string | null | undefined): string {
  const normalized = normalizeStatus(status);
  if (!normalized) return "ללא סטטוס";

  switch (normalized) {
    case "ACTIVE":
      return "מנוי פעיל";
    case "PENDING_APPROVAL":
      return "ממתין לאישור";
    case "SUSPENDED":
      return "מנוי מושהה";
    case "INACTIVE":
      return "מנוי לא פעיל";
    case "TRIAL":
      return "ניסיון";
    default:
      return normalized;
  }
}

export function getVisibleUtilitySectionIds(
  context: WorkspaceAccessContext,
): Array<"admin"> {
  const visible: Array<"admin"> = [];

  if (canAccessOSAdmin(context)) {
    visible.push("admin");
  }

  return visible;
}
