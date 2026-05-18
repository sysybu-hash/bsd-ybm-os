import {
  getDefaultLauncherConfig,
  mergeLauncherConfig,
  parseLauncherConfigFromStorage,
  resolveZoneWidgets,
  widgetsUsedInZone,
} from "@/lib/launcher/user-launcher-config";

describe("user-launcher-config", () => {
  it("returns stable defaults", () => {
    const a = getDefaultLauncherConfig();
    const b = getDefaultLauncherConfig();
    expect(a.quickGrid).toHaveLength(8);
    expect(a.sidebar[0].widgetId).toBe("dashboard");
    expect(b.version).toBe(1);
  });

  it("merges partial config", () => {
    const merged = mergeLauncherConfig({
      quickGrid: [{ widgetId: "crmTable" }],
    });
    expect(merged.quickGrid[0].widgetId).toBe("crmTable");
  });

  it("parses invalid storage safely", () => {
    expect(parseLauncherConfigFromStorage(null).version).toBe(1);
    expect(parseLauncherConfigFromStorage("{bad").version).toBe(1);
  });

  it("dedupes zone widgets", () => {
    const cfg = mergeLauncherConfig({
      sidebar: [
        { widgetId: "dashboard" },
        { widgetId: "dashboard" },
        { widgetId: "crmTable" },
      ],
    });
    const widgets = resolveZoneWidgets(cfg, "sidebar");
    expect(widgets).toEqual(["dashboard", "crmTable"]);
  });

  it("tracks used widgets in zone", () => {
    const cfg = getDefaultLauncherConfig();
    const used = widgetsUsedInZone(cfg, "quickGrid");
    expect(used.has("projectBoard")).toBe(true);
    expect(used.has(null as never)).toBe(false);
  });
});
