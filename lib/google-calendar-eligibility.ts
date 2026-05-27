import type { GoogleCalendarSyncMode, Organization, UserGoogleCalendarSettings } from "@prisma/client";
import { accountHasCalendarScope } from "@/lib/google-calendar-oauth";
import { prisma } from "@/lib/prisma";

export type CalendarEligibilityOrg = Pick<
  Organization,
  "calendarGoogleEnabled" | "subscriptionStatus"
>;

export type CalendarEligibilitySettings = Pick<
  UserGoogleCalendarSettings,
  | "enabled"
  | "syncMode"
  | "consentAt"
  | "calendarId"
  | "pushEnabled"
  | "reminderMinutesBefore"
>;

export function isOrganizationSubscriptionActive(org: CalendarEligibilityOrg): boolean {
  return org.subscriptionStatus === "ACTIVE";
}

export function isCalendarSyncEligible(
  settings: CalendarEligibilitySettings | null | undefined,
  org: CalendarEligibilityOrg,
  accountScope: string | null | undefined,
): boolean {
  if (!org.calendarGoogleEnabled) return false;
  if (!isOrganizationSubscriptionActive(org)) return false;
  if (!settings?.enabled) return false;
  if (!settings.consentAt) return false;
  if (settings.syncMode === "OFF") return false;
  if (!settings.calendarId?.trim()) return false;
  if (!accountHasCalendarScope(accountScope)) return false;
  return true;
}

export function canReadFromGoogleCalendar(
  settings: CalendarEligibilitySettings | null | undefined,
): boolean {
  return settings?.syncMode === "READ_ONLY" || settings?.syncMode === "BIDIRECTIONAL";
}

export function canWriteToGoogleCalendar(
  settings: CalendarEligibilitySettings | null | undefined,
): boolean {
  return settings?.syncMode === "BIDIRECTIONAL";
}

export async function getGoogleAccountScopeForUser(userId: string): Promise<string | null> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
    select: { scope: true },
  });
  return account?.scope ?? null;
}

export async function loadCalendarEligibilityContext(userId: string, organizationId: string) {
  const [org, settings, scope] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { calendarGoogleEnabled: true, subscriptionStatus: true },
    }),
    prisma.userGoogleCalendarSettings.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
    }),
    getGoogleAccountScopeForUser(userId),
  ]);

  const eligible = org ? isCalendarSyncEligible(settings, org, scope) : false;

  return {
    org,
    settings,
    scope,
    eligible,
    canRead: eligible && canReadFromGoogleCalendar(settings),
    canWrite: eligible && canWriteToGoogleCalendar(settings),
  };
}

export type ActivateCalendarSyncInput = {
  consent: boolean;
  syncMode: Exclude<GoogleCalendarSyncMode, "OFF">;
  calendarId: string;
  calendarSummary?: string;
  calendarColor?: string | null;
  pushEnabled?: boolean;
  reminderMinutesBefore?: number;
};
