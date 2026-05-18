import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAdmin } from "@/lib/is-admin";
import { sendTestEmail } from "@/lib/mail";
import { isMailTransportConfigured, mailTransportLabel, getMailFrom } from "@/lib/mail-config";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email || !isAdmin(email)) {
    return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
  }

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

  let to = email;
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
}
