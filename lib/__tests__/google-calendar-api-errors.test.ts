import { describeGoogleCalendarListError } from "@/lib/google-calendar-api-errors";

describe("describeGoogleCalendarListError", () => {
  it("maps insufficient scopes to reconnect", () => {
    const info = describeGoogleCalendarListError(
      Object.assign(new Error("Request had insufficient authentication scopes."), {
        code: 403,
      }),
    );
    expect(info.needsConnect).toBe(true);
    expect(info.code).toBe("google_scope_insufficient");
  });

  it("maps unauthorized to reconnect", () => {
    const info = describeGoogleCalendarListError(
      Object.assign(new Error("invalid_grant"), { code: 401 }),
    );
    expect(info.needsConnect).toBe(true);
    expect(info.code).toBe("google_reauth_required");
  });

  it("does not leak Google project details when Calendar API is disabled", () => {
    const info = describeGoogleCalendarListError(
      new Error("Google Calendar API has not been used in project 123 before or it is disabled."),
    );
    expect(info.code).toBe("calendar_api_disabled");
    expect(info.needsConnect).toBe(false);
    expect(info.message).not.toMatch(/123/);
  });
});
