import type { NextRequest } from "next/server";
import { runTaskRemindersForAllOrganizations } from "@/lib/tasks/task-reminder-runner";
import { runPlannerLocalReminders } from "@/lib/planner/reminder-runner";
import { withCronGuard } from "@/lib/cron-guard";

export async function GET(req: NextRequest) {
  return withCronGuard(req, "cron-task-reminders", { type: "crontab", value: "0 7 * * *" }, async () => {
    const tasks = await runTaskRemindersForAllOrganizations();
    const planner = await runPlannerLocalReminders();
    return { ...tasks, planner };
  });
}
