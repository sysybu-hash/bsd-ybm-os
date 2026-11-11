import "server-only";
import { prisma } from "@/lib/prisma";
import type { VmbSessionUser } from "@/lib/vmb/session";
import { acceptInvite } from "@/lib/vmb/members";

export type VmbWorkspaceRef = { id: string; name: string; role: string };

/**
 * The user's office. A user signing in for the first time gets one of their
 * own (as owner), named after them; joining another office comes with invites.
 */
export async function ensureWorkspace(user: VmbSessionUser): Promise<VmbWorkspaceRef> {
  const m = await prisma.vmbMembership.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: { role: true, workspace: { select: { id: true, name: true } } },
  });
  if (m) return { ...m.workspace, role: m.role };
  const invited = await acceptInvite(user.id, user.email);
  if (invited) return { ...invited, role: "member" };
  const name = user.name?.trim() || user.email.split("@")[0] || "Office";
  const ws = await prisma.vmbWorkspace.create({
    data: { name, members: { create: { userId: user.id, role: "owner" } } },
    select: { id: true, name: true },
  });
  return { ...ws, role: "owner" };
}

/** True when the user belongs to the workspace (any role). */
export async function isMember(userId: string, workspaceId: string): Promise<boolean> {
  const m = await prisma.vmbMembership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { id: true },
  });
  return Boolean(m);
}
