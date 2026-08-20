import type { UserRole } from "@prisma/client";
import { isOrgAdminRole, isWorkspaceManagerRole } from "@/lib/workspace-access";
import { isAccountantRole } from "@/lib/accountant-auth";

/** תפקידים שיכולים לצפות בהוצאות משרד (מרכז מנהל / כספים + רו"ח קריאה-בלבד) */
export const OFFICE_EXPENSE_VIEW_ROLES: UserRole[] = [
  "ORG_ADMIN",
  "SUPER_ADMIN",
  "PROJECT_MGR",
  "ACCOUNTANT",
];

/** תפקידים שיכולים ליצור, לערוך ולמחוק הוצאות משרד */
export const OFFICE_EXPENSE_MANAGE_ROLES: UserRole[] = ["ORG_ADMIN", "SUPER_ADMIN"];

export function canViewOfficeExpenses(role: UserRole | string | null | undefined): boolean {
  return isWorkspaceManagerRole(role) || isAccountantRole(role);
}

export function canManageOfficeExpenses(role: UserRole | string | null | undefined): boolean {
  return isOrgAdminRole(role);
}
