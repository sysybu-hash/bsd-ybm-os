import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/is-admin";

export const MECKANO_SUBSCRIBER_EMAIL = "jbuildgca@gmail.com";
export const MECKANO_ACCESS_ERROR = `Meckano זמין רק למנוי ${MECKANO_SUBSCRIBER_EMAIL}.`;

type SessionLike = {
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

export async function canAccessMeckano(session: SessionLike) {
  if (isAdmin(session?.user?.email)) {
    return true;
  }

  const organizationId = session?.user?.organizationId ?? null;
  if (!organizationId) {
    return false;
  }

  if (isMeckanoSubscriberEmail(session?.user?.email)) {
    return true;
  }

  return isMeckanoEnabledForOrganization(organizationId);
}

export async function getAuthorizedMeckanoOrganizationId(session: SessionLike) {
  const organizationId = session?.user?.organizationId ?? null;
  if (!organizationId) {
    return null;
  }

  return (await canAccessMeckano(session)) ? organizationId : null;
}

/**
 * Fetches attendance logs from Meckano API (mocked for now).
 * In production, this would call Meckano's reports/get_attendance endpoint.
 */
export async function getMeckanoAttendanceForProject(projectId: string, organizationId: string) {
  // 1. Find the linked MeckanoZone
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { meckanoZone: true }
  });

  if (!project || !project.meckanoZoneId) return [];

  // 2. Mock some attendance data based on the zone
  // In a real implementation, we would use process.env.MECKANO_API_KEY
  return [
    { id: 1, employeeName: 'משה כהן', date: new Date().toISOString(), hours: 8.5, status: 'חתימה בשטח' },
    { id: 2, employeeName: 'אבי לוי', date: new Date().toISOString(), hours: 7.2, status: 'חתימה בשטח' },
  ];
}
