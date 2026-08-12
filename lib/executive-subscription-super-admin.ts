import { isAdmin, osOwnerEmail } from "@/lib/is-admin";

/** @deprecated השתמשו ב־osOwnerEmail() */
export const EXECUTIVE_SUBSCRIPTION_SUPER_ADMIN_EMAIL = osOwnerEmail();

export function isExecutiveSubscriptionSuperAdmin(
  email: string | null | undefined,
): boolean {
  return isAdmin(email);
}
