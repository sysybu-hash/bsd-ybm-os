import { isAdmin } from "@/lib/is-admin";

/** @deprecated השתמשו ב־isAdmin — אותה לוגיקה */
export const EXECUTIVE_SUBSCRIPTION_SUPER_ADMIN_EMAIL = "sysybu@gmail.com";

export function isExecutiveSubscriptionSuperAdmin(
  email: string | null | undefined,
): boolean {
  return isAdmin(email);
}
