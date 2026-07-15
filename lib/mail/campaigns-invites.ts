import { createLogger } from "@/lib/logger";
import { sendTransactionalEmail, escapeHtml, mailSiteUrl } from "@/lib/mail-core";

const log = createLogger("mail-campaigns-invites");

export async function sendPayPalSubscriptionConfirmationEmail(
  toEmail: string,
  params: { planLabel: string; amountIls: string; orgName: string },
): Promise<void> {
  const inner = `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:800;color:#f8fafc;text-align:center;">תשלום התקבל</h1>
    <p style="margin:0 0 16px;color:#cbd5e1;font-size:16px;text-align:center;">
      המנוי עבור <strong>${escapeHtml(params.orgName)}</strong> הופעל.
    </p>
    <p style="margin:0;color:#34d399;font-size:20px;font-weight:800;text-align:center;">₪${escapeHtml(params.amountIls)}</p>`;
  const r = await sendTransactionalEmail(
    toEmail.trim().toLowerCase(),
    "BSD-YBM-OS — אישור תשלום מנוי",
    inner,
  );
  if (!r.ok) {
    log.warn("sendPayPalSubscriptionConfirmationEmail failed", { error: r.error });
  }
}

export async function sendSubscriptionJoinInviteEmail(
  toEmail: string,
  params: { headline: string; bodyText: string; ctaLabel?: string; ctaPath?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctaLabel = params.ctaLabel?.trim() || "כניסה ל-BSD-YBM";
  const path = params.ctaPath?.trim().startsWith("/") ? params.ctaPath.trim() : "/login";
  const ctaHref = `${mailSiteUrl()}${path}`;
  const bodySafe = escapeHtml(params.bodyText).replace(/\n/g, "<br/>");
  const inner = `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:800;color:#f8fafc;text-align:center;">${escapeHtml(params.headline)}</h1>
    <p style="margin:0 0 24px;color:#cbd5e1;font-size:15px;line-height:1.75;text-align:center;">
      ${bodySafe}
    </p>
    <p style="text-align:center;margin:0;">
      <a href="${escapeHtml(ctaHref)}" style="display:inline-block;background:#2563eb;color:#fff;font-weight:800;padding:14px 28px;border-radius:14px;text-decoration:none;">
        ${escapeHtml(ctaLabel)}
      </a>
    </p>`;
  return sendTransactionalEmail(
    toEmail.trim().toLowerCase(),
    "BSD-YBM-OS — הזמנה להצטרפות",
    inner,
  );
}

export async function sendOrganizationTeamInviteEmail(
  toEmail: string,
  params: {
    orgName: string;
    registerUrl: string;
    roleLabel: string;
    expiresNote?: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const note = params.expiresNote?.trim()
    ? `<p style="margin:16px 0 0;color:#94a3b8;font-size:13px;text-align:center;">${escapeHtml(params.expiresNote)}</p>`
    : "";
  const inner = `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:800;color:#f8fafc;text-align:center;">הוזמנתם לצוות</h1>
    <p style="margin:0 0 12px;color:#cbd5e1;font-size:15px;text-align:center;">
      ארגון: <strong>${escapeHtml(params.orgName)}</strong> · תפקיד: <strong>${escapeHtml(params.roleLabel)}</strong>
    </p>
    ${note}
    <p style="text-align:center;margin:28px 0 0;">
      <a href="${escapeHtml(params.registerUrl)}" style="display:inline-block;background:#2563eb;color:#fff;font-weight:800;padding:14px 28px;border-radius:14px;text-decoration:none;">
        השלמת הרשמה
      </a>
    </p>`;
  return sendTransactionalEmail(
    toEmail.trim().toLowerCase(),
    `BSD-YBM-OS — הזמנה לצוות (${params.orgName})`,
    inner,
  );
}

export async function sendSubscriptionTierInvitationEmail(
  toEmail: string,
  params: { tierLabel: string; registerUrl: string; expiresNote?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const note = params.expiresNote?.trim()
    ? `<p style="margin:16px 0 0;color:#94a3b8;font-size:13px;text-align:center;">${escapeHtml(params.expiresNote)}</p>`
    : "";
  const inner = `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:800;color:#f8fafc;text-align:center;">הוזמנתם ל-BSD-YBM</h1>
    <p style="margin:0 0 12px;color:#cbd5e1;font-size:15px;text-align:center;">
      רמת מנוי: <strong>${escapeHtml(params.tierLabel)}</strong>
    </p>
    ${note}
    <p style="text-align:center;margin:28px 0 0;">
      <a href="${escapeHtml(params.registerUrl)}" style="display:inline-block;background:#2563eb;color:#fff;font-weight:800;padding:14px 28px;border-radius:14px;text-decoration:none;">
        השלמת הרשמה
      </a>
    </p>`;
  return sendTransactionalEmail(
    toEmail.trim().toLowerCase(),
    `BSD-YBM-OS — הזמנת מנוי (${params.tierLabel})`,
    inner,
  );
}
