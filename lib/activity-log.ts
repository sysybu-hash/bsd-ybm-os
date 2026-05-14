import { prisma } from "@/lib/prisma";

export async function logActivity(
  userId: string,
  organizationId: string,
  action: string,
  details?: string,
) {
  await prisma.activityLog.create({
    data: {
      userId,
      organizationId,
      action,
      details,
    },
  });
}

