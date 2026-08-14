import { splitIntoBalancedRows } from "@/lib/launcher/launcher-grid-layout";
import type { LauncherSlot } from "@/lib/launcher/user-launcher-config";
import { LAUNCHER_GRID_COLS } from "@/lib/launcher/quick-grid-metrics";
export type GridCellCoord = { row: number; col: number };

export type QuickGridCell = GridCellCoord & {
  widgetId: LauncherSlot["widgetId"];
};

function isValidCoord(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0;
}

export function slotHasGridPosition(slot: LauncherSlot): boolean {
  return isValidCoord(slot.row) && isValidCoord(slot.col);
}

export function quickGridUsesCoordinates(slots: LauncherSlot[]): boolean {
  return slots.some((s) => s.widgetId !== null && slotHasGridPosition(s));
}

/** ׳׳׳™׳¨ ׳¨׳©׳™׳׳” ׳™׳©׳ ׳” (׳׳׳ row/col) ׳׳§׳•׳׳•׳¨׳“׳™׳ ׳˜׳•׳× ׳׳₪׳™ ׳©׳•׳¨׳•׳× ׳׳׳•׳–׳ ׳•׳× */
export function ensureQuickGridPositions(slots: LauncherSlot[]): LauncherSlot[] {
  const filled = slots.filter((s) => s.widgetId !== null);
  if (filled.length === 0) return slots;
  if (filled.every(slotHasGridPosition)) return slots;

  const widgets = filled.map((s) => s.widgetId);
  const rows = splitIntoBalancedRows(widgets);
  const positioned: LauncherSlot[] = [];
  let row = 0;
  for (const rowWidgets of rows) {
    const rowLen = rowWidgets.length;
    const colStart = Math.floor((LAUNCHER_GRID_COLS - rowLen) / 2);
    rowWidgets.forEach((widgetId, i) => {
      positioned.push({
        widgetId,
        row,
        col: colStart + i,
      });
    });
    row++;
  }
  return positioned;
}

/** ׳×׳¦׳•׳’׳” ׳¨׳’׳™׳׳” (׳׳ ׳¢׳¨׳™׳›׳”) ג€” ׳¨׳§ ׳×׳׳™׳ ׳×׳₪׳•׳¡׳™׳, ׳׳׳ ׳׳™׳ ׳™׳׳•׳ 7 ׳¢׳׳•׳“׳•׳× */
export function getQuickGridViewExtents(slots: LauncherSlot[]): {
  rows: number;
  cols: number;
  minRow: number;
  minCol: number;
} {
  let minRow = 0;
  let minCol = 0;
  let maxRow = 0;
  let maxCol = 0;
  let found = false;

  for (const s of slots) {
    if (!slotHasGridPosition(s) || !s.widgetId) continue;
    if (!found) {
      minRow = s.row!;
      minCol = s.col!;
      maxRow = s.row!;
      maxCol = s.col!;
      found = true;
    } else {
      minRow = Math.min(minRow, s.row!);
      minCol = Math.min(minCol, s.col!);
      maxRow = Math.max(maxRow, s.row!);
      maxCol = Math.max(maxCol, s.col!);
    }
  }

  if (!found) {
    return { rows: 1, cols: 1, minRow: 0, minCol: 0 };
  }

  return {
    rows: maxRow - minRow + 1,
    cols: maxCol - minCol + 1,
    minRow,
    minCol,
  };
}

export function getQuickGridExtents(
  slots: LauncherSlot[],
  mins?: { cols?: number; rows?: number },
): { rows: number; cols: number } {
  let maxRow = 0;
  let maxCol = 0;
  for (const s of slots) {
    if (!slotHasGridPosition(s)) continue;
    maxRow = Math.max(maxRow, s.row!);
    maxCol = Math.max(maxCol, s.col!);
  }
  const widgetCount = slots.filter((s) => s.widgetId !== null).length;
  const minCols = mins?.cols ?? LAUNCHER_GRID_COLS;
  const minRows =
    mins?.rows ?? Math.max(1, Math.ceil(widgetCount / minCols));
  return {
    rows: Math.max(maxRow + 1, minRows),
    cols: Math.max(maxCol + 1, minCols),
  };
}

/** ׳׳™׳§׳•׳׳™׳ ׳׳×׳¦׳•׳’׳” ג€” ׳©׳•׳׳¨ ׳§׳•׳׳•׳¨׳“׳™׳ ׳˜׳•׳× ׳©׳׳•׳¨׳•׳×; ׳׳׳™׳¨ legacy ׳₪׳¢׳ ׳׳—׳× */
export function quickGridSlotsForView(slots: LauncherSlot[]): LauncherSlot[] {
  const filled = slots.filter((s) => s.widgetId !== null);
  if (filled.length === 0) return [];
  if (filled.every(slotHasGridPosition)) return filled;
  return ensureQuickGridPositions(slots).filter((s) => s.widgetId !== null);
}

