import { decodePlannerSummary, encodePlannerSummary } from "@/lib/planner/meta";

describe("planner meta", () => {
  it("encodes and decodes meeting with reminder", () => {
    const s = encodePlannerSummary("פגישה", "meeting", 30);
    expect(s).toBe("[bsd:meeting:30] פגישה");
    expect(decodePlannerSummary(s)).toEqual({
      title: "פגישה",
      kind: "meeting",
      reminderMinutes: 30,
    });
  });

  it("defaults reminder kind to 15 minutes", () => {
    const s = encodePlannerSummary("להתקשר", "reminder");
    expect(decodePlannerSummary(s).reminderMinutes).toBe(15);
  });

  it("parses legacy prefixes", () => {
    expect(decodePlannerSummary("👥 Hello").kind).toBe("meeting");
    expect(decodePlannerSummary("✅ Todo").kind).toBe("task");
  });
});
