import { filterWidgetsForPicker } from "@/lib/launcher/launcher-permissions";
import { isConsolidatedLegacyWidgetId } from "@/lib/os-assistant/resolve-widget-open";

describe("filterWidgetsForPicker", () => {
  it("excludes consolidated legacy widget ids", () => {
    const options = filterWidgetsForPicker(
      { isPlatformAdmin: true, meckanoEnabled: true, calendarGoogleEnabled: true },
      new Set(),
    );
    expect(options).toContain("financeHub");
    expect(options).toContain("aiHub");
    expect(options).toContain("projectsHub");
    expect(options).not.toContain("dashboard");
    expect(options).not.toContain("appBuilder");
    expect(options).not.toContain("aiScanner");
    expect(options).not.toContain("projectBoard");
    for (const id of options) {
      expect(isConsolidatedLegacyWidgetId(id)).toBe(false);
    }
  });
});
