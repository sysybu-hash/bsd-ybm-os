import { NextResponse } from "next/server";
import { runDailyInsightsForAllOrganizations } from "@/lib/financial-insights";
import { jsonUnauthorized } from "@/lib/api-json";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return jsonUnauthorized("אימות Cron נכשל.");
  }

  await runDailyInsightsForAllOrganizations();
  return NextResponse.json({ ok: true });
}
