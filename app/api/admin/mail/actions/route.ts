import { NextResponse } from "next/server";
import { z } from "zod";
import { withOSAdmin } from "@/lib/api-handler";
import { jsonBadRequest } from "@/lib/api-json";
import { flushAllEmailDigests } from "@/lib/email-digest";
import { runLifecycleCampaigns } from "@/lib/lifecycle-emails";
import {
  getMailFrom,
  getMailReplyTo,
  isMailTransportConfigured,
  mailTransportLabel,
} from "@/lib/mail-config";
import {
  getPlatformMailConfig,
  resolveMailFrom,
  resolveMailReplyTo,
} from "@/lib/mail/platform-mail-settings";
import { getPlatformConfig } from "@/lib/platform-settings";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  action: z.enum(["status", "flush_digest", "run_lifecycle"]),
});

export const POST = withOSAdmin(async (req) => {
  const raw = (await req.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonBadRequest("פעולה לא תקינה", "invalid_mail_action");
  }

  const { action } = parsed.data;

  if (action === "status") {
    const platform = await getPlatformConfig(true);
    const mail = await getPlatformMailConfig();
    return NextResponse.json({
      transportConfigured: isMailTransportConfigured(),
      transportLabel: mailTransportLabel(),
      envFrom: getMailFrom(),
      envReplyTo: getMailReplyTo() ?? null,
      effectiveFrom: await resolveMailFrom(),
      effectiveReplyTo: (await resolveMailReplyTo()) ?? null,
      mail,
      crons: {
        emailDigest: "0 9 * * * UTC → /api/cron/email-digest (גם lifecycle)",
        lifecycle: "0 10 * * * UTC → /api/cron/lifecycle-emails",
        collectionReminders: "0 8 * * 0 UTC → /api/cron/collection-reminders",
      },
      note:
        "מפתחות RESEND_API_KEY / SMTP_* מוגדרים רק ב-Vercel. קבלת מייל נכנסת (IMAP) אינה נתמכת — רק שליחה + הסרה מרשימה (/api/unsubscribe).",
      platformMailSummary: platform.mail,
    });
  }

  if (action === "flush_digest") {
    const result = await flushAllEmailDigests();
    return NextResponse.json({ ok: true, action, result });
  }

  if (action === "run_lifecycle") {
    const result = await runLifecycleCampaigns();
    return NextResponse.json({ ok: true, action, result });
  }

  return jsonBadRequest("פעולה לא נתמכת", "unsupported_action");
});
