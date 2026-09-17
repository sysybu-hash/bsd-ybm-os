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

  it("offers floor-plan visualisation to a company-management org only for a platform admin", () => {
    const base = {
      meckanoEnabled: true,
      calendarGoogleEnabled: true,
      organizationIndustry: "COMPANY_MGMT",
    };
    expect(filterWidgetsForPicker({ ...base, isPlatformAdmin: false }, new Set())).not.toContain(
      "floorplanViz",
    );
    expect(filterWidgetsForPicker({ ...base, isPlatformAdmin: true }, new Set())).toContain(
      "floorplanViz",
    );
  });

  it("hides advanced widgets for EMPLOYEE / CLIENT simple roles", () => {
    const options = filterWidgetsForPicker(
      {
        isPlatformAdmin: false,
        meckanoEnabled: true,
        calendarGoogleEnabled: true,
        role: "EMPLOYEE",
      },
      new Set(),
    );
    expect(options).toContain("projectsHub");
    expect(options).toContain("documentsHub");
    expect(options).not.toContain("fieldCopilot");
    expect(options).not.toContain("executiveHub");
    expect(options).not.toContain("universalCommand");
    expect(options).not.toContain("procurementHub");
  });
});
