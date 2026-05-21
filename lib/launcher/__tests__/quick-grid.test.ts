import {
  buildQuickGridEditMatrix,
  computeQuickGridDimensions,
  ensureQuickGridPositions,
  LAUNCHER_GRID_COLS,
  LAUNCHER_GRID_MIN_EDIT_ROWS,
  moveQuickGridSlot,
  quickGridSlotsForView,
  quickGridUsesCoordinates,
} from "@/lib/launcher/quick-grid";
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
  it("includes empty trailing row for drops", () => {
    const matrix = buildQuickGridEditMatrix(
      [{ widgetId: "dashboard", row: 0, col: 3 }],
      true,
    );
    expect(matrix.length).toBeGreaterThan(1);
    const emptyCells = matrix.flat().filter((c) => c.widgetId === null);
    expect(emptyCells.length).toBeGreaterThan(0);
  });

  it("renders at least LAUNCHER_GRID_MIN_EDIT_ROWS rows", () => {
    const matrix = buildQuickGridEditMatrix(
      [{ widgetId: "dashboard", row: 0, col: 0 }],
      true,
    );
    expect(matrix.length).toBeGreaterThanOrEqual(LAUNCHER_GRID_MIN_EDIT_ROWS);
  });

  it("uses canvas cols for wide edit surface", () => {
    const matrix = buildQuickGridEditMatrix(
      [{ widgetId: "dashboard", row: 0, col: 0 }],
      true,
      { cols: 12, rows: 8 },
    );
    expect(matrix[0]?.length).toBe(12);
    expect(matrix.length).toBeGreaterThanOrEqual(8);
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
