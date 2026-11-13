import "server-only";
import { env } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { escapeHtml, sendTransactionalEmail } from "@/lib/mail-core";
import { parseAdminEmails } from "@/lib/vmb/admin";
import { VMB_BRAND, VMB_ORIGIN } from "@/lib/vmb/brand";
import { dayCosts } from "@/lib/vmb/costs-store";
import { vmbT } from "@/lib/vmb/i18n";

/**
 * The daily cost alert: yesterday's running costs (model calls, conversions, compute, gateway fees) against the ceiling
 * the owner set in the console. No ceiling, no alert. A cost with a missing rate is not in the total, and the mail says so.
 */

const log = createLogger("vmb-cost-alert");
const t = vmbT("he");
const shekels = (minor: number) => `₪${(minor / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

/** Pure: whether to alert, and the mail. */
export function costAlertMail(c: { day: string; totalMinor: number; ceilingMinor: number | null; partial: boolean }): { subject: string; html: string } | null {
  if (c.ceilingMinor == null || c.totalMinor <= c.ceilingMinor) return null;
  const vars = { day: c.day, total: shekels(c.totalMinor), ceiling: shekels(c.ceilingMinor) };
  const url = `${VMB_ORIGIN}/admin?tab=costs`;
  return {
    subject: t("vmb.mail.costSubject", vars),
    html:
      `<h1 style="font-size:20px;margin:0 0 12px;">${escapeHtml(t("vmb.mail.costTitle"))}</h1>` +
      `<p style="margin:0 0 8px;">${escapeHtml(t("vmb.mail.costBody", vars))}</p>` +
      (c.partial ? `<p style="margin:0 0 8px;">${escapeHtml(t("vmb.mail.costPartial"))}</p>` : "") +
      `<p style="margin:24px 0 0;text-align:center;"><a href="${escapeHtml(url)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 22px;border-radius:999px;">${escapeHtml(t("vmb.mail.costCta"))}</a></p>`,
  };
}

export async function sendCostAlert(now = new Date()): Promise<{ day: string; totalMinor: number; ceilingMinor: number | null; alerted: boolean }> {
  const c = await dayCosts(now);
  const mail = costAlertMail(c);
  const to = [...parseAdminEmails(env.VMB_SUPERADMIN_EMAILS)];
  let alerted = false;
  if (mail && to.length) {
    const sent = await sendTransactionalEmail(to, `${mail.subject} · ${VMB_BRAND.name}`, mail.html);
    alerted = sent.ok;
    if (!sent.ok) log.warn("cost alert not sent", { day: c.day, error: sent.error });
  }
  return { day: c.day, totalMinor: c.totalMinor, ceilingMinor: c.ceilingMinor, alerted };
}
