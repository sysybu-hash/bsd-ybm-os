import { inferNotificationLinkType } from "../infer-link-type";

/**
 * These keywords are matched against real notification copy, so the tests use
 * the actual strings the server writes rather than invented ones. If someone
 * rewords a title, the test that breaks names the notification it broke.
 */
describe("inferNotificationLinkType", () => {
  it("routes the price-spike alert to ERP", () => {
    expect(
      inferNotificationLinkType({ title: "⚠️ זוהתה קפיצת מחיר בסריקה" }),
    ).toBe("erp");
  });

  it("routes the missing-price alert to ERP", () => {
    expect(
      inferNotificationLinkType({ title: "השלמת מחיר נדרשת (ERP)" }),
    ).toBe("erp");
  });

  it("routes the price-deviation alert to ERP", () => {
    expect(inferNotificationLinkType({ title: "חריגת מחיר זוהתה!" })).toBe("erp");
  });

  it("routes Meckano notifications to the reports widget", () => {
    expect(inferNotificationLinkType({ title: "דוח מקאנו מוכן" })).toBe("meckanoReports");
  });

  it("routes project and task notifications to the project board", () => {
    expect(inferNotificationLinkType({ title: "משימה חדשה הוקצתה לך" })).toBe("projectBoard");
    expect(inferNotificationLinkType({ title: "עדכון פרויקט" })).toBe("projectBoard");
  });

  it("falls back to general when nothing matches", () => {
    expect(inferNotificationLinkType({ title: "ברוכים הבאים" })).toBe("general");
  });

  /**
   * ERP is checked first on purpose: a price alert names the project it came
   * from, so a text containing both must not be read as a project notification.
   */
  it("prefers ERP when a price alert also names a project", () => {
    expect(
      inferNotificationLinkType({
        title: "חריגת מחיר זוהתה!",
        message: "בפרויקט מגדלי הצפון",
      }),
    ).toBe("erp");
  });

  it("reads every text field, not only the title", () => {
    expect(
      inferNotificationLinkType({ title: "התראה", description: "דוח מקאנו מחכה" }),
    ).toBe("meckanoReports");
    expect(inferNotificationLinkType({ title: "התראה", text: "משימה" })).toBe("projectBoard");
  });

  it("does not trip over absent optional fields", () => {
    expect(inferNotificationLinkType({ title: "ERP" })).toBe("erp");
    expect(inferNotificationLinkType({ title: "" })).toBe("general");
  });
});
