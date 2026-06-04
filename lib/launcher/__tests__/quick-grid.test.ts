import {
  buildQuickGridEditMatrix,
  computeQuickGridDimensions,
  ensureQuickGridPositions,
  getQuickGridEditExtents,
  LAUNCHER_GRID_COLS,
  LAUNCHER_GRID_GAP_PX,
  LAUNCHER_GRID_MAX_EDIT_COLS,
  LAUNCHER_GRID_MAX_EDIT_ROWS,
  LAUNCHER_GRID_MIN_EDIT_ROWS,
  LAUNCHER_QUICK_DESKTOP_MAX_WIDTH_PX,
  LAUNCHER_QUICK_MOBILE_MAX_WIDTH_PX,
  LAUNCHER_QUICK_MOBILE_TILE_PX,
  LAUNCHER_TILE_PX,
  quickGridMobileWidthPx,
  moveQuickGridSlot,
  packQuickGridCentered,
  quickGridDesktopWidthPx,
  quickGridInlineStyle,
  quickGridSlotsForView,
  quickGridUsesCoordinates,
  getQuickGridViewExtents,
  parseQuickGridCellId,
  parseQuickGridDragId,
  quickGridCellId,
  slotHasGridPosition,
  QUICK_GRID_HUB_COLS,
} from "@/lib/launcher/quick-grid";
import { BUSINESS_MGMT_QUICK_GRID, DEFAULT_QUICK_GRID } from "@/lib/launcher/user-launcher-config";
import type { LauncherSlot } from "@/lib/launcher/user-launcher-config";

describe("quickGridMobileWidthPx", () => {
  it("sizes two mobile columns with gap", () => {
    expect(quickGridMobileWidthPx(2)).toBe(
      2 * LAUNCHER_QUICK_MOBILE_TILE_PX + LAUNCHER_GRID_GAP_PX,
    );
    expect(LAUNCHER_QUICK_MOBILE_MAX_WIDTH_PX).toBe(quickGridMobileWidthPx(2));
  });
});

describe("quickGridInlineStyle", () => {
  it("reserves explicit column and row gaps so tiles do not overlap", () => {
    const style = quickGridInlineStyle(4, 2);
    expect(style.columnGap).toBe(`${LAUNCHER_GRID_GAP_PX}px`);
    expect(style.rowGap).toBe(`${LAUNCHER_GRID_GAP_PX}px`);
    expect(style.gridTemplateColumns).toBe("repeat(4, minmax(0, 1fr))");
    expect(LAUNCHER_QUICK_DESKTOP_MAX_WIDTH_PX).toBe(quickGridDesktopWidthPx(4));
    expect(LAUNCHER_QUICK_DESKTOP_MAX_WIDTH_PX).toBe(
      4 * LAUNCHER_TILE_PX + 3 * LAUNCHER_GRID_GAP_PX,
    );
  });
});

describe("packQuickGridCentered", () => {
  it("lays out 6 hubs as 4+2 centered rows", () => {
    const packed = packQuickGridCentered(
      ["crmTable", "projectsHub", "financeHub", "documentsHub", "fieldCopilot", "aiHub"],
      QUICK_GRID_HUB_COLS,
    );
    expect(QUICK_GRID_HUB_COLS).toBe(4);
    expect(packed).toHaveLength(6);
    expect(packed.filter((s) => s.row === 0)).toHaveLength(4);
    expect(packed.find((s) => s.widgetId === "fieldCopilot")).toMatchObject({ row: 1, col: 1 });
    expect(packed.find((s) => s.widgetId === "aiHub")).toMatchObject({ row: 1, col: 2 });
  });

  it("lays out 8 hubs as full 4x2 grid", () => {
    const packed = packQuickGridCentered(
      [
        "crmTable",
        "projectsHub",
        "financeHub",
        "documentsHub",
        "fieldCopilot",
        "aiHub",
        "googleCalendar",
        "meckanoReports",
      ],
      QUICK_GRID_HUB_COLS,
    );
    expect(packed).toHaveLength(8);
    expect(packed.filter((s) => s.row === 0)).toHaveLength(4);
    expect(packed.filter((s) => s.row === 1)).toHaveLength(4);
    expect(packed.find((s) => s.widgetId === "meckanoReports")).toMatchObject({ row: 1, col: 3 });
  });
});

describe("ensureQuickGridPositions", () => {
  it("assigns centered rows for legacy slots", () => {
    const slots: LauncherSlot[] = [
      { widgetId: "dashboard" },
      { widgetId: "crmTable" },
      { widgetId: "erpArchive" },
      { widgetId: "docCreator" },
    ];
    const out = ensureQuickGridPositions(slots);
    expect(out.every((s) => typeof s.row === "number" && typeof s.col === "number")).toBe(true);
    expect(quickGridUsesCoordinates(out)).toBe(true);
  });
});

describe("moveQuickGridSlot", () => {
  it("swaps widgets between occupied cells", () => {
    const slots: LauncherSlot[] = [
      { widgetId: "dashboard", row: 0, col: 2 },
      { widgetId: "crmTable", row: 0, col: 3 },
    ];
    const moved = moveQuickGridSlot(slots, { row: 0, col: 2 }, { row: 0, col: 3 });
    expect(moved.find((s) => s.row === 0 && s.col === 3)?.widgetId).toBe("dashboard");
    expect(moved.find((s) => s.row === 0 && s.col === 2)?.widgetId).toBe("crmTable");
  });

  it("moves widget to empty cell without swapping", () => {
    const slots: LauncherSlot[] = [{ widgetId: "dashboard", row: 0, col: 2 }];
    const moved = moveQuickGridSlot(slots, { row: 0, col: 2 }, { row: 3, col: 4 });
    expect(moved).toHaveLength(1);
    expect(moved[0]).toEqual({ widgetId: "dashboard", row: 3, col: 4 });
  });
});

describe("quickGridSlotsForView", () => {
  it("preserves saved coordinates", () => {
    const slots: LauncherSlot[] = [
      { widgetId: "dashboard", row: 2, col: 5 },
      { widgetId: "crmTable", row: 0, col: 1 },
    ];
    const view = quickGridSlotsForView(slots);
    expect(view.find((s) => s.widgetId === "dashboard")).toMatchObject({ row: 2, col: 5 });
  });
});

describe("computeQuickGridDimensions", () => {
  it("expands cols and rows for large canvas", () => {
    const dims = computeQuickGridDimensions(1600, 900);
    expect(dims.cols).toBeGreaterThan(LAUNCHER_GRID_COLS);
    expect(dims.rows).toBeGreaterThanOrEqual(LAUNCHER_GRID_MIN_EDIT_ROWS);
  });

  it("keeps minimum cols on narrow width", () => {
    const dims = computeQuickGridDimensions(400, 400);
    expect(dims.cols).toBe(LAUNCHER_GRID_COLS);
  });
});

describe("buildQuickGridEditMatrix", () => {
  it("sizes edit grid tightly around widget positions plus one padding row", () => {
    const matrix = buildQuickGridEditMatrix(
      [{ widgetId: "dashboard", row: 0, col: 3 }],
      true,
    );
    expect(matrix.length).toBe(2);
    expect(matrix[0]?.length).toBe(5);
    const emptyCells = matrix.flat().filter((c) => c.widgetId === null);
    expect(emptyCells.length).toBeGreaterThan(0);
  });

  it("sizes default quick grid edit to content plus padding not min 6 rows", () => {
    const extents = getQuickGridEditExtents(DEFAULT_QUICK_GRID, true);
    expect(extents.rows).toBe(3);
    expect(extents.cols).toBe(5);

    const matrix = buildQuickGridEditMatrix(DEFAULT_QUICK_GRID, true);
    expect(matrix.length).toBe(3);
    expect(matrix[0]?.length).toBe(5);
  });

  it("sizes business mgmt 4+2 quick grid edit extents", () => {
    const extents = getQuickGridEditExtents(BUSINESS_MGMT_QUICK_GRID, true);
    expect(extents.rows).toBe(3);
    expect(extents.cols).toBe(5);

    const matrix = buildQuickGridEditMatrix(BUSINESS_MGMT_QUICK_GRID, true);
    expect(matrix.length).toBe(3);
    expect(matrix[0]?.length).toBe(5);
  });

  it("caps edit grid size and ignores viewport canvas", () => {
    const extents = getQuickGridEditExtents(DEFAULT_QUICK_GRID, true);
    expect(extents.cols).toBeLessThanOrEqual(LAUNCHER_GRID_MAX_EDIT_COLS);
    expect(extents.rows).toBeLessThanOrEqual(LAUNCHER_GRID_MAX_EDIT_ROWS);

    const matrix = buildQuickGridEditMatrix(
      [{ widgetId: "dashboard", row: 0, col: 0 }],
      true,
      { cols: 12, rows: 8 },
    );
    expect(matrix[0]?.length).toBeLessThanOrEqual(LAUNCHER_GRID_MAX_EDIT_COLS);
    expect(matrix.length).toBeLessThanOrEqual(LAUNCHER_GRID_MAX_EDIT_ROWS);
    expect(matrix.flat()).toHaveLength(
      matrix.length * (matrix[0]?.length ?? 0),
    );
  });

  it("allows bottom-left placement coordinates", () => {
    const moved = moveQuickGridSlot(
      [{ widgetId: "aiChatFull", row: 0, col: 3 }],
      { row: 0, col: 3 },
      { row: 5, col: 0 },
    );
    expect(moved[0]).toEqual({ widgetId: "aiChatFull", row: 5, col: 0 });
  });
});

describe("quick grid helpers", () => {
  it("slotHasGridPosition and parseQuickGridCellId round-trip", () => {
    expect(slotHasGridPosition({ widgetId: "crm", row: 1, col: 2 })).toBe(true);
    expect(slotHasGridPosition({ widgetId: "crm", row: -1, col: 0 })).toBe(false);
    expect(quickGridCellId(2, 3)).toBe("cell-2-3");
    expect(parseQuickGridCellId("cell-2-3")).toEqual({ row: 2, col: 3 });
    expect(parseQuickGridDragId("drag-0-1")).toEqual({ row: 0, col: 1 });
    expect(parseQuickGridCellId("bad")).toBeNull();
  });

  it("ensureQuickGridPositions assigns coordinates to legacy slots", () => {
    const legacy: LauncherSlot[] = [
      { widgetId: "crmTable" },
      { widgetId: "financeHub" },
    ];
    const positioned = ensureQuickGridPositions(legacy);
    expect(quickGridUsesCoordinates(positioned)).toBe(true);
    expect(positioned.every((s) => slotHasGridPosition(s))).toBe(true);
  });

  it("getQuickGridViewExtents returns unit grid when empty", () => {
    expect(getQuickGridViewExtents([])).toEqual({
      rows: 1,
      cols: 1,
      minRow: 0,
      minCol: 0,
    });
  });
});
