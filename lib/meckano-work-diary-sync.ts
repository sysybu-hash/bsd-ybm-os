import { prisma } from "@/lib/prisma";

type MeckanoAttendanceRow = {
  id?: number;
  employeeName?: string;
  date?: string;
  hours?: number;
  status?: string;
};

/** מייבא נוכחות ממקאנו ליומני עבודה (לפי meckanoZoneId על הפרויקט) */
export async function syncMeckanoToWorkDiaries(
  projectId: string,
  organizationId: string,
  userId: string,
  rows: MeckanoAttendanceRow[],
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  for (const row of rows) {
    if (!row.date) continue;
    const ref = `meckano-${row.id ?? row.date}-${row.employeeName ?? "unknown"}`;
    const date = new Date(row.date);
    if (Number.isNaN(date.getTime())) continue;

    const description = [
      row.employeeName ? `עובד: ${row.employeeName}` : null,
      row.hours != null ? `${row.hours} שעות` : null,
      row.status ? `סטטוס: ${row.status}` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    const existing = await prisma.workDiary.findFirst({
      where: { projectId, meckanoRef: ref },
    });

    if (existing) {
      await prisma.workDiary.update({
        where: { id: existing.id },
        data: {
          description: description || existing.description,
          workHours: row.hours ?? existing.workHours,
          workersCount: 1,
        },
      });
      updated++;
    } else {
      await prisma.workDiary.create({
        data: {
          projectId,
          organizationId,
          description: description || "נוכחות ממקאנו",
          workersCount: 1,
          progress: 0,
          workHours: row.hours,
          meckanoRef: ref,
          date,
          createdByUserId: userId,
        },
      });
      created++;
    }
  }

  return { created, updated };
}
