import {
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
  widgetsUsedInZone,
} from "@/lib/launcher/user-launcher-config";

describe("user-launcher-config", () => {
  it("returns stable defaults with 12 positioned quick grid tiles", () => {
    const a = getDefaultLauncherConfig();
    const b = getDefaultLauncherConfig();
    expect(a.quickGrid).toHaveLength(12);
    expect(a.quickGrid).toEqual(DEFAULT_QUICK_GRID);
    expect(a.sidebar[0].widgetId).toBe("dashboard");
    expect(b.version).toBe(1);
  });

  it("maps default quick grid to screenshot order (LTR cols)", () => {
    const cfg = getDefaultLauncherConfig("CONSTRUCTION");
    expect(cfg.quickGrid.find((s) => s.widgetId === "project")).toMatchObject({ row: 0, col: 5 });
    expect(cfg.quickGrid.find((s) => s.widgetId === "dashboard")).toMatchObject({ row: 0, col: 0 });
    expect(cfg.quickGrid.find((s) => s.widgetId === "helpCenter")).toMatchObject({ row: 1, col: 5 });
    expect(cfg.quickGrid.find((s) => s.widgetId === "aiChatFull")).toMatchObject({ row: 1, col: 0 });
  });

  it("omits meckano in sidebar for company mgmt industry", () => {
    const cfg = getDefaultLauncherConfig("COMPANY_MGMT");
    const ids = cfg.sidebar.map((s) => s.widgetId);
    expect(ids).not.toContain("meckanoReports");
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
    expect(resolved.quickGrid).toHaveLength(12);
    expect(resolved.sidebar[0].widgetId).toBe("crmTable");
  });

  it("keeps saved custom quick grid layout", () => {
    const custom = {
      quickGrid: [{ widgetId: "crmTable", row: 2, col: 1 }],
      sidebar: [{ widgetId: "dashboard" }],
    };
    const resolved = resolveStoredLauncherConfig(custom, "CONSTRUCTION");
    expect(resolved.quickGrid).toHaveLength(1);
    expect(resolved.quickGrid[0]).toEqual({ widgetId: "crmTable", row: 2, col: 1 });
  });

  it("merges partial config", () => {
    const merged = mergeLauncherConfig({
      quickGrid: [{ widgetId: "crmTable", row: 0, col: 0 }],
    });
    expect(merged.quickGrid[0].widgetId).toBe("crmTable");
  });

  it("scrub preserves quickGrid row/col on save", () => {
    const cfg = mergeLauncherConfig({
      quickGrid: [{ widgetId: "aiChatFull", row: 4, col: 0 }],
    });
    const scrubbed = scrubLauncherConfig(cfg);
    expect(scrubbed.quickGrid[0]).toEqual({ widgetId: "aiChatFull", row: 4, col: 0 });
  });

  it("parses invalid storage safely", () => {
    expect(parseLauncherConfigFromStorage(null).version).toBe(1);
    expect(parseLauncherConfigFromStorage("{bad").version).toBe(1);
    expect(parseLauncherConfigFromStorage(null).quickGrid).toHaveLength(12);
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

  it("strips removed launcher widgets from stored config", () => {
    const merged = mergeLauncherConfig({
      quickGrid: [{ widgetId: "googleAssistant" }, { widgetId: "dashboard" }],
    });
    expect(merged.quickGrid[0].widgetId).toBeNull();
    expect(merged.quickGrid[1].widgetId).toBe("dashboard");
  });

  it("strips removed launcher widgets case-insensitively", () => {
    const merged = mergeLauncherConfig({
      quickGrid: [{ widgetId: "GoogleAssistant" }],
    });
    expect(merged.quickGrid[0].widgetId).toBeNull();
  });

  it("trims only trailing empty slots", () => {
    const slots = [
      { widgetId: "dashboard" as const },
      { widgetId: null },
      { widgetId: "crmTable" as const },
      { widgetId: null },
      { widgetId: null },
    ];
    expect(trimTrailingEmptySlots(slots)).toHaveLength(3);
    expect(trimTrailingEmptySlots(slots)[1].widgetId).toBeNull();
  });

  it("compacts zone to filled widgets only", () => {
    const slots = [
      { widgetId: "dashboard" as const },
      { widgetId: null },
      { widgetId: "crmTable" as const },
    ];
    expect(compactZoneSlots(slots)).toHaveLength(2);
  });

  it("appends one trailing empty slot when more apps can be added", () => {
    const filled = getDefaultLauncherConfig().quickGrid;
    const withAdd = ensureEditTrailingEmptySlot(filled, true);
    expect(withAdd.length).toBe(filled.length + 1);
    expect(withAdd[withAdd.length - 1].widgetId).toBeNull();
  });

  it("does not append trailing empty when zone is full or no apps left", () => {
    const full = Array.from({ length: 48 }, () => ({ widgetId: "dashboard" as const }));
    expect(ensureEditTrailingEmptySlot(full, true)).toHaveLength(48);
    expect(ensureEditTrailingEmptySlot(full, false)).toHaveLength(48);
  });
});
