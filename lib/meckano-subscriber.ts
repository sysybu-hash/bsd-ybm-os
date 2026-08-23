/**
 * Pure Meckano subscriber identity — no Prisma, no env, safe in client bundles.
 *
 * Split out of `lib/meckano-access.ts` during the Next 16 upgrade. That module
 * imports `lib/prisma.ts`, and three client modules (the launcher's
 * subscriber-widgets list, useOmniCanvasHandlers, useMeckanoReports) only ever
 * wanted these string helpers. Webpack tree-shook the Prisma import away;
 * Turbopack does not, so the whole workspace booted into "PrismaClient is
 * unable to run in this browser environment".
 *
 * Anything here must stay free of server-only dependencies.
 */

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
