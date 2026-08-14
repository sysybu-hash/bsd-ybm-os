import type { LauncherSlot } from "@/lib/launcher/user-launcher-config";
import {
  LAUNCHER_GRID_MAX_EDIT_COLS,
  LAUNCHER_GRID_MAX_EDIT_ROWS,
} from "@/lib/launcher/quick-grid-metrics";
import {
  ensureQuickGridPositions,
  slotHasGridPosition,
  type GridCellCoord,
  type QuickGridCell,
} from "@/lib/launcher/quick-grid-slots";
/**
 * ׳’׳•׳“׳ ׳¨׳©׳× ׳¢׳¨׳™׳›׳” ג€” ׳×׳™׳‘׳× ׳×׳•׳›׳ ׳¦׳׳•׳“׳” ׳׳׳¨׳™׳—׳™׳ + ׳©׳•׳¨׳”/׳¢׳׳•׳“׳” ׳¨׳™׳§׳” ׳׳—׳× ׳׳›׳ ׳”׳™׳•׳×׳¨.
 * ׳׳ ׳׳׳׳ ׳׳× ׳”׳׳¡׳ ׳•׳׳ ׳›׳•׳₪׳” ׳׳™׳ ׳™׳׳•׳ 6ֳ—7 (׳©׳’׳¨׳ ׳׳©׳•׳¨׳•׳× ׳¨׳™׳§׳•׳× ׳¨׳‘׳•׳×).
 */
export function getQuickGridEditExtents(
  slots: LauncherSlot[],
  extraPadding = true,
): { rows: number; cols: number } {
  const positioned = ensureQuickGridPositions(slots);
  let maxRow = -1;
  let maxCol = -1;
  let hasWidget = false;

  for (const s of positioned) {
    if (!slotHasGridPosition(s) || !s.widgetId) continue;
    hasWidget = true;
    maxRow = Math.max(maxRow, s.row!);
    maxCol = Math.max(maxCol, s.col!);
  }

  const pad = extraPadding ? 1 : 0;

  if (!hasWidget) {
    return {
      rows: Math.min(2 + pad, LAUNCHER_GRID_MAX_EDIT_ROWS),
      cols: Math.min(4 + pad, LAUNCHER_GRID_MAX_EDIT_COLS),
    };
  }

  return {
    rows: Math.min(maxRow + 1 + pad, LAUNCHER_GRID_MAX_EDIT_ROWS),
    cols: Math.min(maxCol + 1 + pad, LAUNCHER_GRID_MAX_EDIT_COLS),
  };
}

/** ׳׳˜׳¨׳™׳¦׳” ׳׳¢׳¨׳™׳›׳” ג€” ׳›׳•׳׳ ׳×׳׳™׳ ׳¨׳™׳§׳™׳ ׳‘׳×׳•׳ ׳×׳™׳‘׳× ׳”׳×׳•׳›׳ ׳‘׳׳‘׳“ */
export function buildQuickGridEditMatrix(
  slots: LauncherSlot[],
  extraEmptyRow = true,
  /** @deprecated ignored ג€” retained for call-site compatibility */
  _canvas?: { cols: number; rows: number },
): QuickGridCell[][] {
  const positioned = ensureQuickGridPositions(slots);
  const { rows: totalRows, cols: totalCols } = getQuickGridEditExtents(
    positioned,
    extraEmptyRow,
  );
  const matrix: QuickGridCell[][] = Array.from({ length: totalRows }, (_, row) =>
    Array.from({ length: totalCols }, (_, col) => ({
      row,
      col,
      widgetId: null,
    })),
  );

  for (const s of positioned) {
    if (!slotHasGridPosition(s) || !s.widgetId) continue;
    const row = s.row!;
    const col = s.col!;
    if (row < totalRows && col < totalCols) {
      matrix[row]![col] = { row, col, widgetId: s.widgetId };
    }
  }
  return matrix;
}

export function quickGridCellId(row: number, col: number): string {
  return `cell-${row}-${col}`;
}

export function quickGridDragId(row: number, col: number): string {
  return `drag-${row}-${col}`;
}

export function parseQuickGridCellId(id: string): GridCellCoord | null {
  const m = /^cell-(\d+)-(\d+)$/.exec(id);
  if (!m) return null;
  return { row: Number(m[1]), col: Number(m[2]) };
}

export function parseQuickGridDragId(id: string): GridCellCoord | null {
  const m = /^drag-(\d+)-(\d+)$/.exec(id);
  if (!m) return null;
  return { row: Number(m[1]), col: Number(m[2]) };
}

/** ׳׳¢׳‘׳™׳¨/׳׳—׳׳™׳£ ׳׳¨׳™׳— ׳‘׳™׳ ׳×׳׳™ ׳¨׳©׳× */
export function moveQuickGridSlot(
  slots: LauncherSlot[],
  from: GridCellCoord,
  to: GridCellCoord,
): LauncherSlot[] {
  const positioned = ensureQuickGridPositions(slots);
  const byKey = new Map<string, LauncherSlot>();
  for (const s of positioned) {
    if (!slotHasGridPosition(s)) continue;
    byKey.set(`${s.row}-${s.col}`, s);
  }

  const fromKey = `${from.row}-${from.col}`;
  const toKey = `${to.row}-${to.col}`;
  const fromSlot = byKey.get(fromKey);
  if (!fromSlot) return positioned;

  const toSlot = byKey.get(toKey);
  byKey.delete(fromKey);
  if (toSlot?.widgetId) {
    byKey.set(fromKey, { widgetId: toSlot.widgetId, row: from.row, col: from.col });
  }
  byKey.set(toKey, { widgetId: fromSlot.widgetId, row: to.row, col: to.col });

  return [...byKey.values()];
}

