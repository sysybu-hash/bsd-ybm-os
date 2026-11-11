import "server-only";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { escapeHtml, sendTransactionalEmail } from "@/lib/mail-core";
import { VMB_BRAND, VMB_ORIGIN } from "@/lib/vmb/brand";
import { vmbT } from "@/lib/vmb/i18n";

/**
 * An office's users (M4): its members, the addresses its owner invited, and the owner's three actions — invite, take
 * back an invitation, remove a member. An invited address joins the office at its first sign-in (ensureWorkspace).
 */

const log = createLogger("vmb-members");
const t = vmbT("he");

export type OfficeMember = { userId: string; email: string; name: string | null; role: string };
export type OfficeInvite = { id: string; email: string; createdAt: Date };

export async function officeMembers(workspaceId: string): Promise<{ members: OfficeMember[]; invites: OfficeInvite[] }> {
  const [members, invites] = await Promise.all([
    prisma.vmbMembership.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "asc" },
      select: { role: true, user: { select: { id: true, email: true, name: true } } },
    }),
    prisma.vmbInvite.findMany({ where: { workspaceId, acceptedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true, email: true, createdAt: true } }),
  ]);
  return { members: members.map((m) => ({ userId: m.user.id, email: m.user.email, name: m.user.name, role: m.role })), invites };
}

async function isOwner(userId: string, workspaceId: string): Promise<boolean> {
  const m = await prisma.vmbMembership.findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, select: { role: true } });
  return m?.role === "owner";
}

export type MemberResult = { ok: true } | { ok: false; code: "not_owner" | "already_member" | "has_office" | "not_found" | "self" };

/**
 * Invites an address. Someone who already belongs to an office cannot be moved by an invitation (there is one office per
 * user for now); they are told so instead.
 */
export async function inviteMember(ownerId: string, workspaceId: string, rawEmail: string): Promise<MemberResult> {
  if (!(await isOwner(ownerId, workspaceId))) return { ok: false, code: "not_owner" };
  const email = rawEmail.trim().toLowerCase();
  const user = await prisma.vmbUser.findUnique({ where: { email }, select: { memberships: { select: { workspaceId: true } } } });
  if (user?.memberships.some((m) => m.workspaceId === workspaceId)) return { ok: false, code: "already_member" };
  if (user?.memberships.length) return { ok: false, code: "has_office" };
  await prisma.vmbInvite.upsert({
    where: { workspaceId_email: { workspaceId, email } },
    create: { workspaceId, email, invitedById: ownerId },
    update: { invitedById: ownerId, acceptedAt: null },
  });
  const ws = await prisma.vmbWorkspace.findUnique({ where: { id: workspaceId }, select: { name: true } });
  const office = escapeHtml(ws?.name ?? "");
  const sent = await sendTransactionalEmail(
    email,
    `${t("vmb.mail.inviteSubject", { office: ws?.name ?? "" })} · ${VMB_BRAND.name}`,
    `<h1 style="font-size:20px;margin:0 0 12px;">${escapeHtml(t("vmb.mail.inviteTitle"))}</h1><p style="margin:0 0 8px;"><strong>${office}</strong></p><p style="margin:0;">${escapeHtml(t("vmb.mail.inviteBody"))}</p><p style="margin:24px 0 0;text-align:center;"><a href="${VMB_ORIGIN}/login" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 22px;border-radius:999px;font-weight:700;">${escapeHtml(t("vmb.mail.inviteCta"))}</a></p>`,
  ).catch((err: unknown) => ({ ok: false as const, error: err instanceof Error ? err.message : String(err) }));
  if (!sent.ok) log.warn("invite mail not sent", { workspaceId, error: sent.error });
  log.info("member invited", { workspaceId });
  return { ok: true };
}

export async function revokeInvite(ownerId: string, workspaceId: string, inviteId: string): Promise<MemberResult> {
  if (!(await isOwner(ownerId, workspaceId))) return { ok: false, code: "not_owner" };
  const r = await prisma.vmbInvite.deleteMany({ where: { id: inviteId, workspaceId, acceptedAt: null } });
  return r.count ? { ok: true } : { ok: false, code: "not_found" };
}

/** Removes a member from the office. The owner cannot remove themself (the office would have no owner). */
export async function removeMember(ownerId: string, workspaceId: string, userId: string): Promise<MemberResult> {
  if (userId === ownerId) return { ok: false, code: "self" };
  if (!(await isOwner(ownerId, workspaceId))) return { ok: false, code: "not_owner" };
  const r = await prisma.vmbMembership.deleteMany({ where: { workspaceId, userId } });
  if (!r.count) return { ok: false, code: "not_found" };
  log.info("member removed", { workspaceId });
  return { ok: true };
}

/**
 * At first sign-in: the oldest open invitation for this address, accepted. Only an address Google verified can take
 * one: anyone can register a password account under any address, so the address alone proves nothing.
 */
export async function acceptInvite(userId: string, email: string): Promise<{ id: string; name: string } | null> {
  const user = await prisma.vmbUser.findUnique({ where: { id: userId }, select: { emailVerified: true } });
  if (!user?.emailVerified) return null;
  const invite = await prisma.vmbInvite.findFirst({
    where: { email: email.toLowerCase(), acceptedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, workspace: { select: { id: true, name: true } } },
  });
  if (!invite) return null;
  await prisma.$transaction([
    prisma.vmbMembership.create({ data: { workspaceId: invite.workspace.id, userId, role: "member" } }),
    prisma.vmbInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } }),
  ]);
  log.info("invite accepted", { workspaceId: invite.workspace.id });
  return invite.workspace;
}

/**
 * Credits spent per project: for each job, what was held minus what came back, summed by project. Holds of jobs still
 * running count in full until they settle.
 */
export async function creditsByProject(workspaceId: string): Promise<Array<{ projectId: string; name: string; credits: number; booklets: number }>> {
  const rows = await prisma.vmbCreditLedger.findMany({
    where: { workspaceId, reason: { in: ["hold", "release"] }, jobId: { not: null } },
    select: { jobId: true, delta: true },
  });
  const byJob = new Map<string, number>();
  for (const r of rows) if (r.jobId) byJob.set(r.jobId, (byJob.get(r.jobId) ?? 0) - r.delta);
  if (!byJob.size) return [];
  const jobs = await prisma.vmbJob.findMany({
    where: { id: { in: [...byJob.keys()] } },
    select: { id: true, status: true, project: { select: { id: true, name: true } } },
  });
  const out = new Map<string, { projectId: string; name: string; credits: number; booklets: number }>();
  for (const j of jobs) {
    const cur = out.get(j.project.id) ?? { projectId: j.project.id, name: j.project.name, credits: 0, booklets: 0 };
    cur.credits += byJob.get(j.id) ?? 0;
    if (j.status === "done") cur.booklets++;
    out.set(j.project.id, cur);
  }
  return [...out.values()].sort((a, b) => b.credits - a.credits);
}
