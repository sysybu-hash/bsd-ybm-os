import { NextResponse } from "next/server";
import { jsonUnauthorized } from "@/lib/api-json";
import { runTaskRemindersForAllOrganizations } from "@/lib/tasks/task-reminder-runner";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return jsonUnauthorized("אימות Cron נכשל.");
  }

  const result = await runTaskRemindersForAllOrganizations();
  return NextResponse.json({ ok: true, ...result });
}
