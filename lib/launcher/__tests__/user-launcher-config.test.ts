import {
  BUSINESS_MGMT_QUICK_GRID,
  CONSTRUCTION_QUICK_GRID,
  compactZoneSlots,
  dedupeQuickGridSlots,
  repackQuickGridLayout,
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
  it("returns v2 defaults with 8 hub quick grid tiles", () => {
    const a = getDefaultLauncherConfig();
    const b = getDefaultLauncherConfig();
    expect(a.quickGrid).toHaveLength(8);
    expect(a.quickGrid).toEqual(DEFAULT_QUICK_GRID);
    expect(a.sidebar[0]!.widgetId).toBe("financeHub");
    expect(b.version).toBe(2);
  });

  it("maps construction quick grid with logisticsHub on row 1 col 1", () => {
    const cfg = getDefaultLauncherConfig("CONSTRUCTION");
    expect(cfg.quickGrid).toEqual(CONSTRUCTION_QUICK_GRID);
    expect(cfg.quickGrid.find((s) => s.widgetId === "executiveHub")).toMatchObject({ row: 0, col: 2 });
    expect(cfg.quickGrid.find((s) => s.widgetId === "logisticsHub")).toMatchObject({ row: 1, col: 1 });
    expect(cfg.quickGrid.find((s) => s.widgetId === "aiHub")).toMatchObject({ row: 1, col: 2 });
    expect(cfg.quickGrid.find((s) => s.widgetId === "fieldCopilot")).toMatchObject({ row: 1, col: 0 });
    expect(cfg.quickGrid.find((s) => s.widgetId === "helpCenter")).toMatchObject({ row: 1, col: 3 });
    expect(cfg.sidebar.some((s) => s.widgetId === "logisticsHub")).toBe(true);
  });

  it("maps default quick grid to 4x2 hub layout for general industry", () => {
    const cfg = getDefaultLauncherConfig("GENERAL");
    expect(cfg.quickGrid.find((s) => s.widgetId === "financeHub")).toMatchObject({ row: 0, col: 2 });
    expect(cfg.quickGrid.find((s) => s.widgetId === "googleCalendar")).toMatchObject({ row: 1, col: 2 });
    expect(cfg.quickGrid.find((s) => s.widgetId === "fieldCopilot")).toMatchObject({ row: 1, col: 0 });
    expect(cfg.quickGrid.find((s) => s.widgetId === "helpCenter")).toMatchObject({ row: 1, col: 3 });
  });

  it("uses 8-tile business grid for company mgmt industry", () => {
    expect(usesBusinessMgmtQuickGrid("COMPANY_MGMT")).toBe(true);
    const cfg = getDefaultLauncherConfig("COMPANY_MGMT");
    expect(cfg.quickGrid).toEqual(BUSINESS_MGMT_QUICK_GRID);
    expect(cfg.quickGrid).toHaveLength(8);
    const ids = cfg.sidebar.map((s) => s.widgetId);
    expect(ids).not.toContain("meckanoReports");
    expect(ids).not.toContain("helpCenter");
    expect(ids).not.toContain("settings");
    expect(cfg.quickGrid.every((s) => s.widgetId !== "fieldCopilot")).toBe(true);
  });

  it("uses 8-tile business grid for platform admin regardless of industry", () => {
    expect(usesBusinessMgmtQuickGrid("CONSTRUCTION", true)).toBe(true);
    const cfg = getDefaultLauncherConfig("CONSTRUCTION", { isPlatformAdmin: true });
    expect(cfg.quickGrid).toEqual(BUSINESS_MGMT_QUICK_GRID);
    expect(cfg.quickGrid).toHaveLength(8);
  });

  it("does not include meckano in default sidebar (subscriber-only via ensureMeckanoLauncherSlots)", () => {
    const cfg = getDefaultLauncherConfig("CONSTRUCTION");
    expect(cfg.sidebar.some((s) => s.widgetId === "meckanoReports")).toBe(false);
  });

  it("uses platform default when quickGrid is empty or missing", () => {
    expect(isQuickGridEmpty([])).toBe(true);
    expect(isQuickGridEmpty([{ widgetId: null }])).toBe(true);
    expect(shouldUsePlatformLauncherDefault(null)).toBe(true);
    expect(shouldUsePlatformLauncherDefault({ quickGrid: [] })).toBe(true);

    const resolved = resolveStoredLauncherConfig({ sidebar: [{ widgetId: "crmTable" }] }, "CONSTRUCTION");
    expect(resolved.quickGrid).toHaveLength(CONSTRUCTION_QUICK_GRID.length);
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
    expect(resolved.quickGrid).toEqual(CONSTRUCTION_QUICK_GRID);
  });

  it("keeps saved custom quick grid layout with hub mapping", () => {
    const custom = {
      version: 2,
      quickGrid: [{ widgetId: "dashboard", row: 2, col: 1 }],
      sidebar: [{ widgetId: "crmTable" }],
    };
    const resolved = resolveStoredLauncherConfig(custom, "CONSTRUCTION");
    expect(resolved.quickGrid).toHaveLength(9);
    expect(resolved.quickGrid.find((s) => s.widgetId === "executiveHub")).toMatchObject({ row: 0, col: 2 });
    expect(resolved.quickGrid.find((s) => s.widgetId === "financeHub")).toMatchObject({ row: 2, col: 1 });
  });

  it("merges partial config", () => {
    const merged = mergeLauncherConfig({
      quickGrid: [{ widgetId: "crmTable", row: 0, col: 0 }],
    });
    expect(merged.quickGrid[0]!.widgetId).toBe("crmTable");
  });

  it("scrub repacks legacy aiChatFull into canonical aiHub slot", () => {
    const cfg = mergeLauncherConfig({
      quickGrid: [{ widgetId: "aiChatFull", row: 4, col: 0 }],
    });
    const scrubbed = scrubLauncherConfig(cfg);
    expect(scrubbed.quickGrid.find((s) => s.widgetId === "aiHub")).toMatchObject({ row: 1, col: 1 });
  });

  it("dedupes repeated documentsHub tiles after legacy migration", () => {
    const slots = [
      { widgetId: "documentsHub" as const, row: 0, col: 0 },
      { widgetId: "documentsHub" as const, row: 1, col: 1 },
      { widgetId: "documentsHub" as const, row: 1, col: 2 },
    ];
    expect(dedupeQuickGridSlots(slots)).toHaveLength(1);
  });

  it("repack collapses legacy document shortcuts into one documentsHub tile", () => {
    const messy = [
      { widgetId: "docCreator" as const, row: 0, col: 0 },
      { widgetId: "aiScanner" as const, row: 1, col: 3 },
      { widgetId: "documentsHub" as const, row: 1, col: 1 },
      { widgetId: "financeHub" as const, row: 0, col: 1 },
    ];
    const packed = repackQuickGridLayout(messy, BUSINESS_MGMT_QUICK_GRID);
    const docTiles = packed.filter((s) => s.widgetId === "documentsHub");
    expect(docTiles).toHaveLength(1);
    expect(docTiles[0]).toMatchObject({ row: 0, col: 1 });
  });

  it("parses invalid storage safely", () => {
    expect(parseLauncherConfigFromStorage(null).version).toBe(2);
    expect(parseLauncherConfigFromStorage("{bad").version).toBe(2);
    expect(parseLauncherConfigFromStorage(null).quickGrid).toHaveLength(8);
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

  it("strips removed launcher widgets from quick grid", () => {
    const merged = mergeLauncherConfig({
      quickGrid: [{ widgetId: "googleAssistant" }, { widgetId: "dashboard", row: 0, col: 1 }],
    });
    expect(merged.quickGrid).toHaveLength(8);
    expect(merged.quickGrid.find((s) => s.widgetId === "financeHub")).toBeDefined();
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
