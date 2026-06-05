import { meckanoFetch } from "@/lib/meckano-fetch";
import {
  extractMeckanoDataArray,
  mapMeckanoReportRow,
  mapMeckanoTask,
  mapMeckanoUser,
} from "@/lib/meckano/mappers";
import type {
  MeckanoEmployee,
  MeckanoReportEntry,
  MeckanoReportFilters,
  MeckanoReportsSummary,
  MeckanoTask,
} from "@/lib/meckano/types";

async function loadUsersAndTasks(apiKey: string) {
  const usersById = new Map<number, MeckanoEmployee>();
  const tasksById = new Map<number, MeckanoTask>();

  const [usersRes, tasksRes] = await Promise.all([
    meckanoFetch("users", apiKey, { method: "GET" }),
    meckanoFetch("tasks", apiKey, { method: "GET" }),
  ]);

  const usersJson = (await usersRes.json().catch(() => ({}))) as Record<string, unknown>;
  const tasksJson = (await tasksRes.json().catch(() => ({}))) as Record<string, unknown>;

  for (const row of extractMeckanoDataArray(usersJson)) {
    const u = mapMeckanoUser(row);
    if (u.id) usersById.set(u.id, u);
  }
  for (const row of extractMeckanoDataArray(tasksJson)) {
    const t = mapMeckanoTask(row);
    if (t.id) tasksById.set(t.id, t);
  }

  return { usersById, tasksById };
}

function applyClientFilters(
  reports: MeckanoReportEntry[],
  filters: MeckanoReportFilters,
  usersById: Map<number, MeckanoEmployee>,
  tasksById: Map<number, MeckanoTask>,
): MeckanoReportEntry[] {
  return reports.filter((r) => {
    if (filters.startDate && r.date < filters.startDate) return false;
    if (filters.endDate && r.date > filters.endDate) return false;

    if (filters.employeeId !== "all") {
      const empId = Number(filters.employeeId);
      const user = usersById.get(empId);
      if (user && r.employeeName !== user.name) {
        const loose = r.employeeName.includes(user.name) || user.name.includes(r.employeeName);
        if (!loose) return false;
      }
    }

    if (filters.projectId === "general") {
      const generalHints = ["כללי", "משרד", "general", "office"];
      if (!generalHints.some((h) => r.project.toLowerCase().includes(h))) return false;
    } else if (filters.projectId !== "all") {
      const taskId = Number(filters.projectId);
      const task = tasksById.get(taskId);
      if (task && r.project !== task.name && !r.project.includes(task.name)) return false;
    }

    if (filters.locationId !== "all" && filters.locationId) {
      if (!r.location.toLowerCase().includes(filters.locationId.toLowerCase())) return false;
    }

    return true;
  });
}

async function tryFetchReportRows(
  apiKey: string,
  filters: MeckanoReportFilters,
): Promise<Record<string, unknown>[]> {
  const body = JSON.stringify({
    from: filters.startDate,
    to: filters.endDate,
    startDate: filters.startDate,
    endDate: filters.endDate,
  });

  const attempts: Array<{ method: string; path: string; body?: string }> = [
    { method: "POST", path: "reports", body },
    { method: "GET", path: `reports?from=${filters.startDate}&to=${filters.endDate}` },
    { method: "GET", path: `reports?startDate=${filters.startDate}&endDate=${filters.endDate}` },
    { method: "GET", path: "attendance" },
    { method: "POST", path: "attendance", body },
    { method: "GET", path: "reports/get_attendance" },
    { method: "POST", path: "reports/get_attendance", body },
  ];

  for (const attempt of attempts) {
    try {
      const res = await meckanoFetch(attempt.path, apiKey, {
        method: attempt.method,
        ...(attempt.body ? { body: attempt.body } : {}),
      });
      if (!res.ok) continue;
      const json = (await res.json().catch(() => null)) as unknown;
      const rows = extractMeckanoDataArray(json);
      if (rows.length > 0) return rows;
      if (json && typeof json === "object" && (json as { status?: boolean }).status === true) {
        const empty = extractMeckanoDataArray(json);
        if (Array.isArray((json as { data?: unknown }).data)) return empty;
      }
    } catch {
      continue;
    }
  }

  return [];
}

export async function fetchMeckanoReports(
  apiKey: string,
  filters: MeckanoReportFilters,
): Promise<{ reports: MeckanoReportEntry[]; summary: MeckanoReportsSummary }> {
  const { usersById, tasksById } = await loadUsersAndTasks(apiKey);
  const rawRows = await tryFetchReportRows(apiKey, filters);

  const reports: MeckanoReportEntry[] = [];
  rawRows.forEach((row, index) => {
    const mapped = mapMeckanoReportRow(row, index, usersById, tasksById);
    if (mapped) reports.push(mapped);
  });

  const filtered = applyClientFilters(reports, filters, usersById, tasksById);
  filtered.sort((a, b) => b.date.localeCompare(a.date));

  const totalHours = filtered.reduce((s, r) => s + r.hours, 0);
  const workDays = new Set(filtered.map((r) => `${r.date}|${r.employeeName}`)).size;

  return {
    reports: filtered,
    summary: {
      totalHours: Math.round(totalHours * 10) / 10,
      workDays,
    },
  };
}

export async function fetchMeckanoEmployees(apiKey: string): Promise<MeckanoEmployee[]> {
  const res = await meckanoFetch("users", apiKey, { method: "GET" });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || json.status === false) {
    throw new Error(String(json.message ?? "Meckano users error"));
  }
  return extractMeckanoDataArray(json).map(mapMeckanoUser).filter((u) => u.id > 0);
}

export async function fetchMeckanoTasks(apiKey: string): Promise<MeckanoTask[]> {
  const res = await meckanoFetch("tasks", apiKey, { method: "GET" });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || json.status === false) {
    throw new Error(String(json.message ?? "Meckano tasks error"));
  }
  return extractMeckanoDataArray(json).map(mapMeckanoTask).filter((t) => t.id > 0);
}
