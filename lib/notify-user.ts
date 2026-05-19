import { prisma } from "@/lib/prisma";
import { publishNotificationEvent } from "@/lib/notifications-pubsub";

export async function notifyUser(
  userId: string,
  title: string,
  body: string,
  meta?: { linkType?: string | null; targetId?: string | null },
) {
  const row = await prisma.inAppNotification.create({
    data: {
      userId,
      title,
      body,
      read: false,
      linkType: meta?.linkType ?? null,
      targetId: meta?.targetId ?? null,
    },
  });

  await publishNotificationEvent(userId, {
    id: row.id,
    title: row.title,
    message: row.body,
    severity: row.title.includes("נחתם") ? "success" : "info",
    createdAt: row.createdAt.toISOString(),
    linkType: row.linkType,
    targetId: row.targetId,
  });

  return row;
}
