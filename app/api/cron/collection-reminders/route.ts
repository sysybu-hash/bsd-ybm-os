import { NextResponse } from "next/server";
import { jsonUnauthorized } from "@/lib/api-json";
import { runCollectionRemindersCron } from "@/lib/collection/run-collection-cron";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return jsonUnauthorized("אימות Cron נכשל.");
  }

  const result = await runCollectionRemindersCron();
  return NextResponse.json({ ok: true, ...result });
}
