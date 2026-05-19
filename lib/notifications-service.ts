import { prisma } from './prisma';
import { publishNotificationEvent } from '@/lib/notifications-pubsub';

export async function createOrganizationNotification(organizationId: string, title: string, body: string) {
  const users = await prisma.user.findMany({
    where: { organizationId },
    select: { id: true }
  });

  if (users.length === 0) return;

  const rows = await prisma.inAppNotification.createMany({
    data: users.map(user => ({
      userId: user.id,
      title,
      body,
      read: false
    }))
  });

  await Promise.all(
    users.map((user) =>
      publishNotificationEvent(user.id, {
        title,
        message: body,
        severity: title.includes('נחתם') ? 'success' : 'info',
        createdAt: new Date().toISOString(),
      }),
    ),
  );

  return rows;
}
