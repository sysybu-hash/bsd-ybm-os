import {
  buildQuickGridEditMatrix,
  computeQuickGridDimensions,
  ensureQuickGridPositions,
  getQuickGridEditExtents,
  LAUNCHER_GRID_COLS,
  LAUNCHER_GRID_MAX_EDIT_COLS,
  LAUNCHER_GRID_MAX_EDIT_ROWS,
  LAUNCHER_GRID_MIN_EDIT_ROWS,
  moveQuickGridSlot,
  quickGridSlotsForView,
  quickGridUsesCoordinates,
} from "@/lib/launcher/quick-grid";
import { BUSINESS_MGMT_QUICK_GRID, DEFAULT_QUICK_GRID } from "@/lib/launcher/user-launcher-config";
import type { LauncherSlot } from "@/lib/launcher/user-launcher-config";

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
    expect(extents.cols).toBe(4);

    const matrix = buildQuickGridEditMatrix(DEFAULT_QUICK_GRID, true);
    expect(matrix.length).toBe(3);
    expect(matrix[0]?.length).toBe(4);
  });

  it("sizes business mgmt 3x2 quick grid edit extents", () => {
    const extents = getQuickGridEditExtents(BUSINESS_MGMT_QUICK_GRID, true);
    expect(extents.rows).toBe(3);
    expect(extents.cols).toBe(4);

    const matrix = buildQuickGridEditMatrix(BUSINESS_MGMT_QUICK_GRID, true);
    expect(matrix.length).toBe(3);
    expect(matrix[0]?.length).toBe(4);
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
