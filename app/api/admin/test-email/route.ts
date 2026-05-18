import { NextResponse } from "next/server";
import { withOSAdmin } from "@/lib/api-handler";
import { sendTestEmail } from "@/lib/mail";
import { isMailTransportConfigured, mailTransportLabel, getMailFrom } from "@/lib/mail-config";

export const dynamic = "force-dynamic";

export const POST = withOSAdmin(async (req, { email: adminEmail }) => {
  if (!isMailTransportConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: "שירות המייל לא מוגדר — הוסיפו RESEND_API_KEY או SMTP_HOST ב-Vercel",
        transport: mailTransportLabel(),
        from: getMailFrom(),
      },
      { status: 503 },
    );
  }

  let to = adminEmail;
  try {
    const body = (await req.json()) as { to?: string };
    if (body?.to?.trim()) {
      to = body.to.trim().toLowerCase();
    }
  } catch {
    /* ברירת מחדל: מייל המנהל המחובר */
  }

  const result = await sendTestEmail(to);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, transport: mailTransportLabel(), from: getMailFrom() },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    to,
    transport: mailTransportLabel(),
    from: getMailFrom(),
  });
});
