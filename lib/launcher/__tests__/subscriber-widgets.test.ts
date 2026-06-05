import { isSubscriberWidgetVisible } from "@/lib/launcher/subscriber-widgets";

describe("subscriber-widgets", () => {
  it("allows meckano only for the designated subscriber", () => {
    expect(isSubscriberWidgetVisible("meckanoReports", "jbuildgca@gmail.com")).toBe(true);
    expect(isSubscriberWidgetVisible("meckanoReports", "JBUILDGCA@GMAIL.COM")).toBe(true);
    expect(isSubscriberWidgetVisible("meckanoReports", "other@example.com")).toBe(false);
    expect(isSubscriberWidgetVisible("meckanoReports", null)).toBe(false);
  });

  it("allows other widgets for any user", () => {
    expect(isSubscriberWidgetVisible("crmTable", "other@example.com")).toBe(true);
  });
});
