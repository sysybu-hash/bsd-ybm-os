import {
  BUSINESS_MGMT_QUICK_GRID,
  compactZoneSlots,
  DEFAULT_QUICK_GRID,
  ensureEditTrailingEmptySlot,
  getDefaultLauncherConfig,
  isQuickGridEmpty,
  mergeLauncherConfig,
  parseLauncherConfigFromStorage,
  resolveStoredLauncherConfig,
  resolveZoneWidgets,
  scrubLauncherConfig,
  shouldUsePlatformLauncherDefault,
  trimTrailingEmptySlots,
  usesBusinessMgmtQuickGrid,
  widgetsUsedInZone,
} from "@/lib/launcher/user-launcher-config";

describe("user-launcher-config", () => {
  it("returns v2 defaults with 6 hub quick grid tiles", () => {
    const a = getDefaultLauncherConfig();
    const b = getDefaultLauncherConfig();
    expect(a.quickGrid).toHaveLength(6);
    expect(a.quickGrid).toEqual(DEFAULT_QUICK_GRID);
    expect(a.sidebar[0]!.widgetId).toBe("financeHub");
    expect(b.version).toBe(2);
  });

  it("maps default quick grid to hub layout", () => {
    const cfg = getDefaultLauncherConfig("CONSTRUCTION");
    expect(cfg.quickGrid.find((s) => s.widgetId === "financeHub")).toMatchObject({ row: 0, col: 0 });
    expect(cfg.quickGrid.find((s) => s.widgetId === "projectsHub")).toMatchObject({ row: 0, col: 1 });
    expect(cfg.quickGrid.find((s) => s.widgetId === "fieldCopilot")).toMatchObject({ row: 1, col: 1 });
  });

  it("uses 8-tile business grid for company mgmt industry", () => {
    expect(usesBusinessMgmtQuickGrid("COMPANY_MGMT")).toBe(true);
    const cfg = getDefaultLauncherConfig("COMPANY_MGMT");
    expect(cfg.quickGrid).toEqual(BUSINESS_MGMT_QUICK_GRID);
    const ids = cfg.sidebar.map((s) => s.widgetId);
    expect(ids).not.toContain("meckanoReports");
    expect(cfg.quickGrid.every((s) => s.widgetId !== "fieldCopilot")).toBe(true);
  });

  it("uses 8-tile business grid for platform admin regardless of industry", () => {
    expect(usesBusinessMgmtQuickGrid("CONSTRUCTION", true)).toBe(true);
    const cfg = getDefaultLauncherConfig("CONSTRUCTION", { isPlatformAdmin: true });
    expect(cfg.quickGrid).toEqual(BUSINESS_MGMT_QUICK_GRID);
    expect(cfg.quickGrid).toHaveLength(8);
  });

  it("includes meckano in sidebar for construction industry", () => {
    const cfg = getDefaultLauncherConfig("CONSTRUCTION");
    expect(cfg.sidebar.some((s) => s.widgetId === "meckanoReports")).toBe(true);
  });

  it("uses platform default when quickGrid is empty or missing", () => {
    expect(isQuickGridEmpty([])).toBe(true);
    expect(isQuickGridEmpty([{ widgetId: null }])).toBe(true);
    expect(shouldUsePlatformLauncherDefault(null)).toBe(true);
    expect(shouldUsePlatformLauncherDefault({ quickGrid: [] })).toBe(true);

    const resolved = resolveStoredLauncherConfig({ sidebar: [{ widgetId: "crmTable" }] }, "CONSTRUCTION");
    expect(resolved.quickGrid).toHaveLength(DEFAULT_QUICK_GRID.length);
    expect(resolved.sidebar[0]!.widgetId).toBe("financeHub");
  });

  it("resets v1 stored config to v2 default", () => {
    const v1 = {
      version: 1,
      quickGrid: [{ widgetId: "dashboard", row: 0, col: 0 }],
      sidebar: [{ widgetId: "dashboard" }],
    };
    const resolved = resolveStoredLauncherConfig(v1, "CONSTRUCTION");
    expect(resolved.version).toBe(2);
    expect(resolved.quickGrid).toEqual(DEFAULT_QUICK_GRID);
  });

  it("keeps saved custom quick grid layout with hub mapping", () => {
    const custom = {
      version: 2,
      quickGrid: [{ widgetId: "dashboard", row: 2, col: 1 }],
      sidebar: [{ widgetId: "crmTable" }],
    };
    const resolved = resolveStoredLauncherConfig(custom, "CONSTRUCTION");
    expect(resolved.quickGrid).toHaveLength(1);
    expect(resolved.quickGrid[0]).toEqual({ widgetId: "financeHub", row: 2, col: 1 });
  });

  it("merges partial config", () => {
    const merged = mergeLauncherConfig({
      quickGrid: [{ widgetId: "crmTable", row: 0, col: 0 }],
    });
    expect(merged.quickGrid[0]!.widgetId).toBe("crmTable");
  });

  it("scrub maps legacy widget ids to hubs", () => {
    const cfg = mergeLauncherConfig({
      quickGrid: [{ widgetId: "aiChatFull", row: 4, col: 0 }],
    });
    const scrubbed = scrubLauncherConfig(cfg);
    expect(scrubbed.quickGrid[0]).toEqual({ widgetId: "aiHub", row: 4, col: 0 });
  });

  it("parses invalid storage safely", () => {
    expect(parseLauncherConfigFromStorage(null).version).toBe(2);
    expect(parseLauncherConfigFromStorage("{bad").version).toBe(2);
    expect(parseLauncherConfigFromStorage(null).quickGrid).toHaveLength(6);
  });

  it("dedupes zone widgets", () => {
    const cfg = mergeLauncherConfig({
      sidebar: [
        { widgetId: "financeHub" },
        { widgetId: "financeHub" },
        { widgetId: "crmTable" },
      ],
    });
    const widgets = resolveZoneWidgets(cfg, "sidebar");
    expect(widgets).toEqual(["financeHub", "crmTable"]);
  });

  it("tracks used widgets in zone", () => {
    const cfg = getDefaultLauncherConfig();
    const used = widgetsUsedInZone(cfg, "quickGrid");
    expect(used.has("projectsHub")).toBe(true);
    expect(used.has(null as never)).toBe(false);
  });

  it("strips removed launcher widgets and maps dashboard to financeHub", () => {
    const merged = mergeLauncherConfig({
      quickGrid: [{ widgetId: "googleAssistant" }, { widgetId: "dashboard" }],
    });
    expect(merged.quickGrid[0]!.widgetId).toBeNull();
    expect(merged.quickGrid[1]!.widgetId).toBe("financeHub");
  });

  it("trims only trailing empty slots", () => {
    const slots = [
      { widgetId: "financeHub" as const },
      { widgetId: null },
      { widgetId: "crmTable" as const },
      { widgetId: null },
      { widgetId: null },
    ];
    expect(trimTrailingEmptySlots(slots)).toHaveLength(3);
    expect(trimTrailingEmptySlots(slots)[1]!.widgetId).toBeNull();
  });

  it("compacts zone to filled widgets only", () => {
    const slots = [
      { widgetId: "financeHub" as const },
      { widgetId: null },
      { widgetId: "crmTable" as const },
    ];
    expect(compactZoneSlots(slots)).toHaveLength(2);
  });

  it("appends one trailing empty slot when more apps can be added", () => {
    const filled = getDefaultLauncherConfig().quickGrid;
    const withAdd = ensureEditTrailingEmptySlot(filled, true);
    expect(withAdd.length).toBe(filled.length + 1);
    expect(withAdd[withAdd.length - 1]!.widgetId).toBeNull();
  });
});
