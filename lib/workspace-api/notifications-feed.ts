import { prisma } from "@/lib/prisma";

export async function getUnreadNotificationsFeed(userId: string) {
  const notifications = await prisma.inAppNotification.findMany({
    where: { userId, read: false },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return notifications.map((n) => ({
    id: n.id,
    title: n.title,
    message: n.body,
    severity: n.title.includes("נחתם") ? "success" : "info",
    createdAt: n.createdAt.toISOString(),
    linkType: n.linkType ?? null,
    targetId: n.targetId ?? null,
  }));
}
