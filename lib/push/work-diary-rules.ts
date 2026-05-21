import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push/send-notification";

/** תזכורת יומית לרשום יומן עבודה בפרויקטים פעילים */
export async function runWorkDiaryDailyReminders(): Promise<{ notified: number }> {
  const since = new Date();
  since.setDate(since.getDate() - 1);

  const projects = await prisma.project.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      organizationId: true,
      workDiaries: {
        where: { date: { gte: since } },
        take: 1,
        select: { id: true },
      },
    },
    take: 200,
  });

  let notified = 0;
  for (const p of projects) {
    if (p.workDiaries.length > 0) continue;

    const members = await prisma.user.findMany({
      where: { organizationId: p.organizationId, accountStatus: "ACTIVE" },
      select: { id: true },
      take: 20,
    });

    for (const u of members) {
      const n = await sendPushToUser(u.id, {
        title: `יומן עבודה — ${p.name}`,
        body: "לא נרשם יומן עבודה ב-24 השעות האחרונות. לחץ לעדכון.",
        url: `/?w=project&projectId=${encodeURIComponent(p.id)}`,
        tag: `work-diary-${p.id}`,
      });
      notified += n;
    }
  }

  return { notified };
}

/** התראה על ירידת התקדמות ביומן */
export async function notifyProgressDrop(
  userId: string,
  projectId: string,
  projectName: string,
  prev: number,
  next: number,
): Promise<void> {
  if (next >= prev) return;
  await sendPushToUser(userId, {
    title: `ירידת התקדמות — ${projectName}`,
    body: `ההתקדמות ירדה מ-${prev}% ל-${next}%`,
    url: `/?w=project&projectId=${encodeURIComponent(projectId)}`,
    tag: `progress-drop-${projectId}`,
  });
}
