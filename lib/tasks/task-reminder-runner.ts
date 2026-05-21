import { prisma } from "@/lib/prisma";
import { createOrganizationNotification } from "@/lib/notifications-service";

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

export async function runTaskRemindersForAllOrganizations(): Promise<{ notified: number }> {
  const todayStart = startOfToday();
  const todayEnd = endOfToday();
  let notified = 0;

  const orgs = await prisma.organization.findMany({ select: { id: true, name: true } });

  for (const org of orgs) {
    const overdue = await prisma.task.findMany({
      where: {
        organizationId: org.id,
        status: { not: "DONE" },
        dueDate: { lt: todayStart },
      },
      include: { project: true },
      take: 20,
    });

    const dueToday = await prisma.task.findMany({
      where: {
        organizationId: org.id,
        status: { not: "DONE" },
        dueDate: { gte: todayStart, lte: todayEnd },
      },
      include: { project: true },
      take: 20,
    });

    if (overdue.length > 0) {
      await createOrganizationNotification(
        org.id,
        "משימות באיחור",
        `${overdue.length} משימות באיחור — לדוגמה: «${overdue[0]!.title}» (${overdue[0]!.project.name})`,
      );
      notified += 1;
    }

    if (dueToday.length > 0) {
      await createOrganizationNotification(
        org.id,
        "משימות להיום",
        `${dueToday.length} משימות ליום זה — «${dueToday[0]!.title}»`,
      );
      notified += 1;
    }
  }

  return { notified };
}
