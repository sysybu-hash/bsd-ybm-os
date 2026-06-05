import type { MeckanoEmployee, MeckanoReportEntry, MeckanoTask } from "@/lib/meckano/types";

export function roundMeckanoHours(hours: unknown): number {
  const n = typeof hours === "number" ? hours : parseFloat(String(hours ?? 0));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function pickString(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const v = row[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function pickNumber(row: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const v = row[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim()) {
      const n = parseFloat(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

export function mapMeckanoUser(row: Record<string, unknown>): MeckanoEmployee {
  const first = pickString(row, ["firstName", "first_name"]);
  const last = pickString(row, ["lastName", "last_name"]);
  const name =
    `${first} ${last}`.trim() ||
    pickString(row, ["workerTag", "name"]) ||
    pickString(row, ["email"]) ||
    `User ${String(row.id ?? "")}`;

  const dept = row.department;
  const department =
    typeof dept === "object" && dept !== null && "name" in dept
      ? String((dept as { name?: string }).name ?? "ללא מחלקה")
      : pickString(row, ["department", "departmentName"]) || "ללא מחלקה";

  return {
    id: Number(row.id ?? 0),
    name,
    email: pickString(row, ["email"]),
    phone: pickString(row, ["phone"]),
    department,
  };
}

export function mapMeckanoTask(row: Record<string, unknown>): MeckanoTask {
  return {
    id: Number(row.id ?? 0),
    name:
      pickString(row, ["description", "comment", "name", "title"]) ||
      `Project ${String(row.id ?? "")}`,
  };
}

export function mapMeckanoReportRow(
  row: Record<string, unknown>,
  index: number,
  usersById: Map<number, MeckanoEmployee>,
  tasksById: Map<number, MeckanoTask>,
): MeckanoReportEntry | null {
  const dateRaw =
    pickString(row, ["date", "workDate", "day", "reportDate"]) ||
    (row.timestamp ? String(row.timestamp).slice(0, 10) : "");
  if (!dateRaw) return null;

  const userId = pickNumber(row, ["userId", "user_id", "employeeId", "workerId"]);
  const taskId = pickNumber(row, ["taskId", "task_id", "projectId", "jobId"]);

  const employee =
    userId != null ? usersById.get(userId) : undefined;
  const task = taskId != null ? tasksById.get(taskId) : undefined;

  const employeeName =
    pickString(row, ["employeeName", "workerName", "userName"]) ||
    employee?.name ||
    "—";

  const project =
    pickString(row, ["project", "taskName", "taskDescription", "jobName"]) ||
    task?.name ||
    "כללי / משרד";

  const location =
    pickString(row, ["location", "zoneName", "site", "address"]) || "לא צוין";

  const hours = roundMeckanoHours(
    row.hours ?? row.totalHours ?? row.duration ?? row.workHours ?? row.time,
  );

  const id: string | number =
    row.id != null && (typeof row.id === "string" || typeof row.id === "number")
      ? row.id
      : `${dateRaw}-${userId ?? index}-${taskId ?? "x"}`;

  return {
    id,
    date: dateRaw.length >= 10 ? dateRaw.slice(0, 10) : dateRaw,
    employeeName,
    project,
    location,
    hours,
  };
}

export function extractMeckanoDataArray(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== "object") return [];
  const obj = payload as Record<string, unknown>;
  if (Array.isArray(obj.data)) {
    return obj.data.filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null);
  }
  if (Array.isArray(obj.reports)) {
    return obj.reports.filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null);
  }
  if (Array.isArray(obj.records)) {
    return obj.records.filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null);
  }
  return [];
}
