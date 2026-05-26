import {
  shouldEmailForNotificationTitle,
} from "@/lib/notification-email-bridge";

describe("shouldEmailForNotificationTitle", () => {
  it("matches task and quote reminders", () => {
    expect(shouldEmailForNotificationTitle("משימות באיחור")).toBe(true);
    expect(shouldEmailForNotificationTitle("משימות להיום")).toBe(true);
    expect(shouldEmailForNotificationTitle("הצעת מחיר ממתינה — 3 ימים")).toBe(true);
  });

  it("matches signed docs and price alerts", () => {
    expect(shouldEmailForNotificationTitle("מסמך נחתם בהצלחה")).toBe(true);
    expect(shouldEmailForNotificationTitle("⚠️ זוהתה קפיצת מחיר בסריקה")).toBe(true);
  });

  it("ignores generic low-priority titles", () => {
    expect(shouldEmailForNotificationTitle("עדכון כללי")).toBe(false);
    expect(shouldEmailForNotificationTitle("")).toBe(false);
  });
});
