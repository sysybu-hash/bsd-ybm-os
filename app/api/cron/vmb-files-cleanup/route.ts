import type { NextRequest } from "next/server";
import { withCronGuard } from "@/lib/cron-guard";
import { purgeExpiredFiles } from "@/lib/vmb/retention";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Daily: deletes the source files of VMB projects whose retention ran out (rule 13.11). */
export async function GET(req: NextRequest) {
  return withCronGuard(req, "vmb-files-cleanup", { type: "crontab", value: "30 3 * * *" }, async () => ({ cleared: await purgeExpiredFiles() }));
}
