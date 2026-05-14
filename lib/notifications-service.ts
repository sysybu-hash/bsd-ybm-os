import { prisma } from './prisma';

export async function createOrganizationNotification(organizationId: string, title: string, body: string) {
  const users = await prisma.user.findMany({
    where: { organizationId },
    select: { id: true }
  });

  if (users.length === 0) return;

  await prisma.inAppNotification.createMany({
    data: users.map(user => ({
      userId: user.id,
      title,
      body,
      read: false
    }))
  });
}
