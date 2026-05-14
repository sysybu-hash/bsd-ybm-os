import { NextResponse } from "next/server";
import { withOSAdmin } from "@/lib/api-handler";
import { hasOSPayPalConfigured } from "@/lib/platform-paypal";
import { prisma } from "@/lib/prisma";

type ServiceStatus = {
  name: string;
  ok: boolean;
  detail: string;
};

export const GET = withOSAdmin(async () => {
  const statuses: ServiceStatus[] = [];

  try {
    await prisma.$queryRaw`SELECT 1`;
    statuses.push({ name: "Database", ok: true, detail: "מחובר" });
  } catch {
    statuses.push({ name: "Database", ok: false, detail: "שגיאת חיבור" });
  }

  statuses.push({
    name: "AI Engine",
    ok: Boolean(
      process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
        process.env.GEMINI_API_KEY ||
        process.env.OPENAI_API_KEY ||
        process.env.ANTHROPIC_API_KEY,
    ),
    detail: "בדיקת מפתחות API",
  });

  const payplusOk = Boolean(
    process.env.PAYPLUS_API_KEY?.trim() &&
      process.env.PAYPLUS_SECRET_KEY?.trim() &&
      process.env.PAYPLUS_PAYMENT_PAGE_UID?.trim(),
  );
  const platformPaypal = hasOSPayPalConfigured();
  statuses.push({
    name: "תשלומים",
    ok: true,
    detail: [
      "ארגונים: PayPal לפי הגדרות DB",
      platformPaypal ? "BSD-YBM-OS: PayPal ENV מוגדר" : "BSD-YBM-OS: PayPal ENV לא מוגדר",
      payplusOk ? "PayPlus API זמין" : "ללא PayPlus API",
    ].join(" · "),
  });

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    statuses,
  });
});
