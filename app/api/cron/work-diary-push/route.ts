import { NextResponse } from "next/server";
import { runWorkDiaryDailyReminders } from "@/lib/push/work-diary-rules";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET?.trim();
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runWorkDiaryDailyReminders();
  return NextResponse.json({ ok: true, ...result });
}
