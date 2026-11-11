import "server-only";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { escapeHtml, sendTransactionalEmail } from "@/lib/mail-core";
import { VMB_BRAND, VMB_ORIGIN } from "@/lib/vmb/brand";
import { vmbT } from "@/lib/vmb/i18n";

/**
 * The mail that tells a client their booklet is ready, or why the run stopped. Sent to whoever created the project (the
 * office's owners when that user is gone). A mail that fails to send never fails the job; it is only logged.
 */

const log = createLogger("vmb-notify");
const t = vmbT("he");

export type JobEnd = { kind: "done" } | { kind: "stopped"; message: string | null };

/** Pure: the subject and body (inner HTML) of the mail. */
export function jobEndMail(projectName: string, projectUrl: string, end: JobEnd): { subject: string; html: string } {
  const name = escapeHtml(projectName);
  const link = `<p style="margin:24px 0 0;text-align:center;"><a href="${escapeHtml(projectUrl)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 22px;border-radius:999px;font-weight:700;">${escapeHtml(t("vmb.mail.open"))}</a></p>`;
  if (end.kind === "done") {
    return {
      subject: t("vmb.mail.doneSubject", { project: projectName }),
      html: `<h1 style="font-size:20px;margin:0 0 12px;">${escapeHtml(t("vmb.mail.doneTitle"))}</h1><p style="margin:0 0 8px;"><strong>${name}</strong></p><p style="margin:0;">${escapeHtml(t("vmb.mail.doneBody"))}</p>${link}`,
    };
  }
  const why = end.message ? escapeHtml(end.message) : escapeHtml(t("vmb.run.fault"));
  return {
    subject: t("vmb.mail.stopSubject", { project: projectName }),
    html: `<h1 style="font-size:20px;margin:0 0 12px;">${escapeHtml(t("vmb.mail.stopTitle"))}</h1><p style="margin:0 0 8px;"><strong>${name}</strong></p><p style="margin:0 0 8px;">${why}</p><p style="margin:0;color:#94a3b8;font-size:13px;">${escapeHtml(t("vmb.run.refunded"))}</p>${link}`,
  };
}

async function recipients(projectId: string): Promise<{ name: string; to: string[] } | null> {
  const p = await prisma.vmbProject.findUnique({
    where: { id: projectId },
    select: { name: true, createdById: true, workspace: { select: { members: { where: { role: "owner" }, select: { user: { select: { id: true, email: true } } } } } } },
  });
  if (!p) return null;
  const owners = p.workspace.members.map((m) => m.user);
  const creator = p.createdById ? await prisma.vmbUser.findUnique({ where: { id: p.createdById }, select: { email: true } }) : null;
  const to = creator ? [creator.email] : owners.map((o) => o.email);
  return to.length ? { name: p.name, to } : null;
}

export async function notifyJobEnd(projectId: string, end: JobEnd): Promise<void> {
  try {
    const r = await recipients(projectId);
    if (!r) return;
    const mail = jobEndMail(r.name, `${VMB_ORIGIN}/app/p/${projectId}`, end);
    const sent = await sendTransactionalEmail(r.to, `${mail.subject} · ${VMB_BRAND.name}`, mail.html);
    if (!sent.ok) log.warn("vmb job mail not sent", { projectId, error: sent.error });
  } catch (err: unknown) {
    log.error("vmb job mail failed", { projectId, error: err instanceof Error ? err.message : String(err) });
  }
}
