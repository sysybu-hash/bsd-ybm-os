import { meckanoFetch } from "@/lib/meckano-fetch";
import { extractMeckanoDataArray, mapMeckanoUser } from "@/lib/meckano/mappers";
import { fetchMeckanoReports } from "@/lib/meckano/reports";
import type { MeckanoReportFilters } from "@/lib/meckano/types";
import { prisma } from "@/lib/prisma";

export type MeckanoAttendanceRow = {
  id?: number;
  employeeName?: string;
  date?: string;
  hours?: number;
  status?: string;
};

/** Attendance rows for a project linked to a Meckano zone (last 30 days). */
export async function getMeckanoAttendanceForProject(
  projectId: string,
  organizationId: string,
  apiKey: string,
): Promise<MeckanoAttendanceRow[]> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { meckanoZone: true },
  });

  if (!project?.meckanoZoneId || !project.meckanoZone) return [];

  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);

  const filters: MeckanoReportFilters = {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    employeeId: "all",
    projectId: "all",
    locationId: project.meckanoZone.name,
  };

  const { reports } = await fetchMeckanoReports(apiKey, filters);

  const zoneName = project.meckanoZone.name.toLowerCase();
  const matched = reports.filter(
    (r) =>
      r.location.toLowerCase().includes(zoneName) ||
      r.project.toLowerCase().includes(zoneName),
  );

  return matched.map((r, i) => ({
    id: typeof r.id === "number" ? r.id : i,
    employeeName: r.employeeName,
    date: r.date,
    hours: r.hours,
    status: "מקאנו",
  }));
}

/** Recent punch events (read-only) from users list + optional punch log endpoint. */
export async function fetchRecentPunchStatus(apiKey: string): Promise<
  Array<{ userId: number; name: string; lastAction?: string }>
> {
  const res = await meckanoFetch("users", apiKey, { method: "GET" });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const users = extractMeckanoDataArray(json).map(mapMeckanoUser);
  return users.slice(0, 50).map((u) => ({
    userId: u.id,
    name: u.name,
    lastAction: undefined,
  }));
}
