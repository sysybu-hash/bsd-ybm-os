import { getServerSession } from "next-auth";
import type { UserRole } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { isAdmin } from "@/lib/is-admin";

export type WorkspaceActionContext = {
  userId: string;
  organizationId: string;
  role: UserRole | string;
  email: string | null;
};

export type OSAdminActionContext = {
  userId: string;
  email: string;
  organizationId: string | null;
  role: UserRole | string;
};

export type ActionAuthFailure = { ok: false; error: string };
export type WorkspaceActionOk = { ok: true; ctx: WorkspaceActionContext };
export type OSAdminActionOk = { ok: true; ctx: OSAdminActionContext };

const FINANCE_MUTATION_ROLES: ReadonlyArray<UserRole | string> = [
  "ORG_ADMIN",
  "SUPER_ADMIN",
  "PROJECT_MGR",
];

/** Roles allowed to create/update/delete issued documents and invoices. */
export function financeMutationRoles(): ReadonlyArray<UserRole | string> {
  return FINANCE_MUTATION_ROLES;
}

export async function requireWorkspaceAction(options?: {
  allowedRoles?: ReadonlyArray<UserRole | string>;
}): Promise<WorkspaceActionOk | ActionAuthFailure> {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  if (!user?.id) {
    return { ok: false, error: "נדרשת התחברות" };
  }
  const organizationId = user.organizationId ?? null;
  if (!organizationId) {
    return { ok: false, error: "אין ארגון משויך" };
  }
  const role = String(user.role ?? "");
  if (options?.allowedRoles?.length && !options.allowedRoles.includes(role)) {
    return { ok: false, error: "אין הרשאה לביצוע פעולה זו" };
  }
  return {
    ok: true,
    ctx: {
      userId: user.id,
      organizationId,
      role,
      email: user.email ?? null,
    },
  };
}

export async function requireOSAdminAction(): Promise<
  OSAdminActionOk | ActionAuthFailure
> {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  if (!user?.id || !user.email) {
    return { ok: false, error: "נדרשת התחברות" };
  }
  if (!isAdmin(user.email)) {
    return { ok: false, error: "אין הרשאת מנהל פלטפורמה" };
  }
  return {
    ok: true,
    ctx: {
      userId: user.id,
      email: user.email,
      organizationId: user.organizationId ?? null,
      role: String(user.role ?? ""),
    },
  };
}
