import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";

export const MECKANO_SUBSCRIBER_EMAIL = "jbuildgca@gmail.com";
export const MECKANO_ACCESS_ERROR = `Meckano זמין רק למנוי ${MECKANO_SUBSCRIBER_EMAIL}.`;

export type SessionLike = {
  user?: {
    email?: string | null;
    organizationId?: string | null;
  } | null;
} | null | undefined;

export function normalizeMeckanoEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() ?? "";
}

export function isMeckanoSubscriberEmail(email: string | null | undefined) {
  return normalizeMeckanoEmail(email) === MECKANO_SUBSCRIBER_EMAIL;
}

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
