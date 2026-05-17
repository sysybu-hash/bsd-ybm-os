import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { meckanoFetch } from "@/lib/meckano-fetch";
import { meckanoSessionFromWorkspace, requireMeckanoSession } from "@/lib/meckano-route-auth";

export const POST = withWorkspacesAuth(async (request, ctx): Promise<NextResponse> => {
  try {
    const sessionLike = await meckanoSessionFromWorkspace(ctx);
    const auth = await requireMeckanoSession(sessionLike);
    if ("error" in auth) return auth.error;
    const apiKey = auth.apiKey;

    const body = await request.json();
    const { startDate, endDate, employeeId, projectId } = body;

    const startTs = Math.floor(new Date(startDate).getTime() / 1000);
    const endTs = Math.floor(new Date(endDate).getTime() / 1000);

    const employeesRes = await meckanoFetch("users", apiKey);
    const employeesData = await employeesRes.json();
    const employeesMap = new Map<number, string>();
    if (employeesData.status && employeesData.data) {
      employeesData.data.forEach((emp: { id: number; firstName?: string; lastName?: string }) => {
        employeesMap.set(emp.id, `${emp.firstName} ${emp.lastName}`);
      });
    }

    const taskEntriesRes = await meckanoFetch(`task-entry?start=${startTs}&end=${endTs}`, apiKey);
    const taskEntriesData = await taskEntriesRes.json();

    const timeEntriesRes = await meckanoFetch(`time-entry?start=${startTs}&end=${endTs}`, apiKey);
    const timeEntriesData = await timeEntriesRes.json();

    if (!taskEntriesData.status && !timeEntriesData.status) {
      return NextResponse.json(
        {
          error:
            taskEntriesData.data?.message ||
            timeEntriesData.data?.message ||
            "Meckano API error",
        },
        { status: 400 },
      );
    }

    const taskEntries = taskEntriesData.data || [];
    const timeEntries = timeEntriesData.data || [];

    const grouped = new Map<
      string,
      {
        id: string;
        date: string;
        employeeName: string;
        employeeId: number;
        project: string;
        projectId: number | string;
        location: string;
        hours: number;
      }
    >();

    taskEntries.sort((a: { ts: number }, b: { ts: number }) => a.ts - b.ts);
    const userLastTaskIn = new Map<string, number>();

    taskEntries.forEach((entry: { userId: number; taskId: number; ts: number; taskStop?: boolean; id: number; userName?: string; description?: string }) => {
      const userId = entry.userId;
      const taskId = entry.taskId;
      const key = `${userId}_${taskId}`;
      const date = new Date(entry.ts * 1000).toISOString().split("T")[0];
      const groupKey = `${userId}_${date}_${taskId}`;

      if (!entry.taskStop) {
        userLastTaskIn.set(key, entry.ts);
      } else {
        const inTs = userLastTaskIn.get(key);
        if (inTs) {
          const diffMs = (entry.ts - inTs) * 1000;
          const hours = diffMs / (1000 * 60 * 60);

          if (!grouped.has(groupKey)) {
            grouped.set(groupKey, {
              id: `task_${entry.id}`,
              date: date,
              employeeName: employeesMap.get(userId) || entry.userName || `User ${userId}`,
              employeeId: userId,
              project: entry.description || "פרויקט",
              projectId: taskId,
              location: "לא צוין",
              hours: 0,
            });
          }

          const group = grouped.get(groupKey)!;
          group.hours += hours;
          userLastTaskIn.delete(key);
        }
      }
    });

    timeEntries.sort((a: { ts: number }, b: { ts: number }) => a.ts - b.ts);
    const userLastTimeIn = new Map<number, number>();
    const dailyTotalAttendance = new Map<string, number>();

    timeEntries.forEach((entry: { userId: number; ts: number; isOut?: boolean }) => {
      const userId = entry.userId;
      const date = new Date(entry.ts * 1000).toISOString().split("T")[0];
      const dayKey = `${userId}_${date}`;

      if (!entry.isOut) {
        userLastTimeIn.set(userId, entry.ts);
      } else {
        const inTs = userLastTimeIn.get(userId);
        if (inTs) {
          const diffMs = (entry.ts - inTs) * 1000;
          const hours = diffMs / (1000 * 60 * 60);
          dailyTotalAttendance.set(dayKey, (dailyTotalAttendance.get(dayKey) || 0) + hours);
          userLastTimeIn.delete(userId);
        }
      }
    });

    dailyTotalAttendance.forEach((totalHours, dayKey) => {
      const [userId, date] = dayKey.split("_");

      let assignedHours = 0;
      grouped.forEach((group, groupKey) => {
        if (groupKey.startsWith(`${userId}_${date}_`)) {
          assignedHours += group.hours;
        }
      });

      const unassignedHours = totalHours - assignedHours;

      if (unassignedHours > 0.08) {
        const generalKey = `${userId}_${date}_general`;
        grouped.set(generalKey, {
          id: `gen_${userId}_${date}`,
          date: date,
          employeeName: employeesMap.get(parseInt(userId, 10)) || `User ${userId}`,
          employeeId: parseInt(userId, 10),
          project: "כללי / משרד",
          projectId: "general",
          location: "לא צוין",
          hours: Math.round(unassignedHours * 100) / 100,
        });
      }
    });

    let mappedReports = Array.from(grouped.values());

    if (employeeId && employeeId !== "all") {
      mappedReports = mappedReports.filter(
        (r) => r.employeeId.toString() === employeeId.toString(),
      );
    }
    if (projectId && projectId !== "all") {
      mappedReports = mappedReports.filter(
        (r) => r.projectId.toString() === projectId.toString(),
      );
    }

    const totalHours = mappedReports.reduce((sum, r) => sum + r.hours, 0);

    return NextResponse.json({
      success: true,
      reports: mappedReports,
      summary: {
        totalHours: Math.round(totalHours * 100) / 100,
        daysCount: mappedReports.length,
      },
    });
  } catch (error: unknown) {
    return apiErrorResponse(error, "Meckano Reports Error");
  }
});
