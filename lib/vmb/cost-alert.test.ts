jest.mock("server-only", () => ({}));
jest.mock("@/lib/vmb/costs-store", () => ({ dayCosts: jest.fn() }));
jest.mock("@/lib/mail-core", () => ({ escapeHtml: (s: string) => s, sendTransactionalEmail: jest.fn() }));

import { costAlertMail } from "@/lib/vmb/cost-alert";

describe("VMB daily cost alert", () => {
  it("says nothing when no ceiling was set", () => {
    expect(costAlertMail({ day: "2026-11-12", totalMinor: 999_999, ceilingMinor: null, partial: false })).toBeNull();
  });

  it("says nothing at or under the ceiling", () => {
    expect(costAlertMail({ day: "2026-11-12", totalMinor: 5000, ceilingMinor: 5000, partial: false })).toBeNull();
  });

  it("alerts above the ceiling, with the day, the total and the ceiling", () => {
    const mail = costAlertMail({ day: "2026-11-12", totalMinor: 12_345, ceilingMinor: 5000, partial: false });
    expect(mail?.subject).toContain("2026-11-12");
    expect(mail?.subject).toContain("₪123.45");
    expect(mail?.html).toContain("₪50");
    expect(mail?.html).toContain("/admin?tab=costs");
  });

  it("says the total is partial when a rate is missing", () => {
    const whole = costAlertMail({ day: "2026-11-12", totalMinor: 9000, ceilingMinor: 5000, partial: false })!;
    const partial = costAlertMail({ day: "2026-11-12", totalMinor: 9000, ceilingMinor: 5000, partial: true })!;
    expect(partial.html.length).toBeGreaterThan(whole.html.length);
  });
});
