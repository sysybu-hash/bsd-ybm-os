import type { UserRole } from "@prisma/client";
import { isAdmin } from "@/lib/is-admin";

export function canManageOrgUsers(role: UserRole, actorEmail?: string | null): boolean {
  if (actorEmail && isAdmin(actorEmail)) return true;
  return role === "ORG_ADMIN";
}
