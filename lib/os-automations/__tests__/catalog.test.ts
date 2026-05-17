import { AUTOMATION_INTENT_ENUM, normalizeAutomationIntent } from "@/lib/os-automations/catalog";

describe("normalizeAutomationIntent", () => {
  it("returns intent id when valid", () => {
    expect(normalizeAutomationIntent("open_scanner")).toBe("open_scanner");
    expect(normalizeAutomationIntent("open_dashboard")).toBe("open_dashboard");
  });

  it("returns null for unknown id", () => {
    expect(normalizeAutomationIntent("not_an_intent")).toBeNull();
  });
});

describe("AUTOMATION_INTENT_ENUM", () => {
  it("lists every catalog intent exactly once", () => {
    expect(new Set(AUTOMATION_INTENT_ENUM).size).toBe(AUTOMATION_INTENT_ENUM.length);
    expect(AUTOMATION_INTENT_ENUM.length).toBeGreaterThan(20);
  });
});
