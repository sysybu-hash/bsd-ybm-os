import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import {
  isMeckanoSubscriberEmail,
  MECKANO_SUBSCRIBER_EMAIL,
  type SessionLike,
} from "@/lib/meckano-subscriber";

// Re-exported so the ~15 server-side callers keep one import site. Client code
// must import from "@/lib/meckano-subscriber" directly — this module reaches
// Prisma and is poisoned by `server-only`.
export {
  MECKANO_ACCESS_ERROR,
  MECKANO_SUBSCRIBER_EMAIL,
  isMeckanoSubscriberEmail,
  normalizeMeckanoEmail,
  type SessionLike,
} from "@/lib/meckano-subscriber";

export async function isMeckanoEnabledForOrganization(organizationId: string | null | undefined) {
  if (!organizationId) {
    return false;
  }

  const subscriber = await prisma.user.findFirst({
    where: {
      organizationId,
      email: {
        equals: MECKANO_SUBSCRIBER_EMAIL,
        mode: "insensitive",
      },
    },
    select: { id: true },
  });

  return Boolean(subscriber);
}

/** UI + API — רק המנוי המורשה (לא כל הארגון). */
export async function canAccessMeckano(session: SessionLike) {
  return isMeckanoSubscriberEmail(session?.user?.email);
}

export async function getAuthorizedMeckanoOrganizationId(session: SessionLike) {
  const organizationId = session?.user?.organizationId ?? null;
  if (!organizationId) {
    return null;
  }

  return (await canAccessMeckano(session)) ? organizationId : null;
}

/** Fetches attendance logs from Meckano API for a project with a linked zone. */
export async function getMeckanoAttendanceForProject(projectId: string, organizationId: string) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { meckanoApiKey: true },
  });
  const apiKey = org?.meckanoApiKey?.trim() || env.MECKANO_API_KEY?.trim();
  if (!apiKey) return [];

  const { getMeckanoAttendanceForProject: fetchAttendance } = await import(
    "@/lib/meckano/attendance"
  );
  return fetchAttendance(projectId, organizationId, apiKey);
}
