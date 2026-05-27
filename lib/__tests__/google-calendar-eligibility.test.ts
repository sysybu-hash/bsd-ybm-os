import { GOOGLE_CALENDAR_SCOPE } from "@/lib/google-calendar-config";
import {
  canReadFromGoogleCalendar,
  canWriteToGoogleCalendar,
  isCalendarSyncEligible,
  isOrganizationSubscriptionActive,
} from "@/lib/google-calendar-eligibility";

const calendarScope = `openid email profile ${GOOGLE_CALENDAR_SCOPE}`;

const activeOrg = { calendarGoogleEnabled: true, subscriptionStatus: "ACTIVE" as const };

const activeSettings = {
  enabled: true,
  syncMode: "BIDIRECTIONAL" as const,
  consentAt: new Date("2026-01-01"),
  calendarId: "primary",
  pushEnabled: true,
  reminderMinutesBefore: 15,
};

describe("google-calendar-eligibility", () => {
  it("requires active subscription and org flag", () => {
    expect(isOrganizationSubscriptionActive(activeOrg)).toBe(true);
    expect(
      isCalendarSyncEligible(activeSettings, activeOrg, calendarScope),
    ).toBe(true);
    expect(
      isCalendarSyncEligible(activeSettings, { ...activeOrg, calendarGoogleEnabled: false }, calendarScope),
    ).toBe(false);
    expect(
      isCalendarSyncEligible(activeSettings, { ...activeOrg, subscriptionStatus: "CANCELED" }, "calendar"),
    ).toBe(false);
  });

  it("blocks sync without consent or calendar scope", () => {
    expect(
      isCalendarSyncEligible(
        { ...activeSettings, consentAt: null },
        activeOrg,
        calendarScope,
      ),
    ).toBe(false);
    expect(isCalendarSyncEligible(activeSettings, activeOrg, "openid email")).toBe(false);
  });

  it("maps sync modes to read/write", () => {
    expect(canReadFromGoogleCalendar({ ...activeSettings, syncMode: "READ_ONLY" })).toBe(true);
    expect(canWriteToGoogleCalendar({ ...activeSettings, syncMode: "READ_ONLY" })).toBe(false);
    expect(canWriteToGoogleCalendar(activeSettings)).toBe(true);
  });
});
