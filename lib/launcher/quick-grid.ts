import type { WidgetType } from "@/hooks/use-window-manager";
import { splitIntoBalancedRows } from "@/lib/launcher/launcher-grid-layout";
import type { LauncherSlot } from "@/lib/launcher/user-launcher-config";

/** עמודות ברירת מחדל לרשת Hub בדסקטופ (4+2 לאריחים מרכזיים) */
export const QUICK_GRID_HUB_COLS = 4;

/** עמודות רשת quick grid במובייל */
export const QUICK_GRID_MOBILE_COLS = 2;

/** גודל אריח במובייל (מטרת מגע ~120px+) */
export const LAUNCHER_QUICK_MOBILE_TILE_PX = 124;

export const LAUNCHER_GRID_COLS = 7;
export const LAUNCHER_TILE_PX = 140;
/** רווח בין אריחים (תואם gap-4) */
export const LAUNCHER_GRID_GAP_PX = 16;
/** שורות מינימליות במצב עריכה — קנבס גלילה כמו מסך בית נייד */
export const LAUNCHER_GRID_MIN_EDIT_ROWS = 6;
/** תקרת עמודות/שורות במצב עריכה — מונע מילוי מסך בתאי "הוסף אפליקציה" */
export const LAUNCHER_GRID_MAX_EDIT_COLS = 10;
export const LAUNCHER_GRID_MAX_EDIT_ROWS = 9;

/** ממדים דינמיים לפי שטח זמין (תא 140px + רווח) */
export function computeQuickGridDimensions(
  widthPx: number,
  heightPx: number,
): { cols: number; rows: number } {
  const cellStride = LAUNCHER_TILE_PX + LAUNCHER_GRID_GAP_PX;
  const cols = Math.max(
    LAUNCHER_GRID_COLS,
    Math.floor((Math.max(0, widthPx) + LAUNCHER_GRID_GAP_PX) / cellStride),
  );
  const rows = Math.max(
    LAUNCHER_GRID_MIN_EDIT_ROWS,
    Math.floor((Math.max(0, heightPx) + LAUNCHER_GRID_GAP_PX) / cellStride),
  );
  return { cols, rows };
}

/** רוחב רשת דסקטופ לפי מספר עמודות (אריח + רווחים) */
export function quickGridDesktopWidthPx(cols: number): number {
  const safeCols = Math.max(1, cols);
  return safeCols * LAUNCHER_TILE_PX + Math.max(0, safeCols - 1) * LAUNCHER_GRID_GAP_PX;
}

/** רוחב רשת מובייל (2 עמודות ממורכזות) */
export function quickGridMobileWidthPx(cols: number = QUICK_GRID_MOBILE_COLS): number {
  const safeCols = Math.max(1, cols);
  return (
    safeCols * LAUNCHER_QUICK_MOBILE_TILE_PX +
    Math.max(0, safeCols - 1) * LAUNCHER_GRID_GAP_PX
  );
}

/** מקסימום רוחב מעטפת quick grid במובייל */
export const LAUNCHER_QUICK_MOBILE_MAX_WIDTH_PX = quickGridMobileWidthPx(QUICK_GRID_MOBILE_COLS);

export type QuickGridInlineStyle = {
  width: string;
  maxWidth: string;
  gridTemplateColumns: string;
  columnGap: string;
  rowGap: string;
};

/** רשת דסקטופ: עמודות גמישות + רווח קבוע; אריחים מתכווצים בתוך התא (לא חופפים) */
export function quickGridInlineStyle(cols: number, _rows: number): QuickGridInlineStyle {
  const gapPx = LAUNCHER_GRID_GAP_PX;
  const maxW = quickGridDesktopWidthPx(cols);
  return {
    width: `min(100%, ${maxW}px)`,
    maxWidth: `${maxW}px`,
    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
    columnGap: `${gapPx}px`,
    rowGap: `${gapPx}px`,
  };
}

/** רוחב מקסימלי לרשת 4 עמודות (Hub) */
export const LAUNCHER_QUICK_DESKTOP_MAX_WIDTH_PX = quickGridDesktopWidthPx(QUICK_GRID_HUB_COLS);

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

/** ממיר רשימה ישנה (ללא row/col) לקואורדינטות לפי שורות מאוזנות */
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

/** תצוגה רגילה (לא עריכה) — רק תאים תפוסים, ללא מינימום 7 עמודות */
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

/** מיקומים לתצוגה — שומר קואורדינטות שמורות; ממיר legacy פעם אחת */
export function quickGridSlotsForView(slots: LauncherSlot[]): LauncherSlot[] {
  const filled = slots.filter((s) => s.widgetId !== null);
  if (filled.length === 0) return [];
  if (filled.every(slotHasGridPosition)) return filled;
  return ensureQuickGridPositions(slots).filter((s) => s.widgetId !== null);
}

/**
 * גודל רשת עריכה — תיבת תוכן צמודה לאריחים + שורה/עמודה ריקה אחת לכל היותר.
 * לא ממלא את המסך ולא כופה מינימום 6×7 (שגרם לשורות ריקות רבות).
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

/** מטריצה לעריכה — כולל תאים ריקים בתוך תיבת התוכן בלבד */
export function buildQuickGridEditMatrix(
  slots: LauncherSlot[],
  extraEmptyRow = true,
  /** @deprecated ignored — retained for call-site compatibility */
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

/** מעביר/מחליף אריח בין תאי רשת */
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

/** סדר תצוגה לשורות מאוזנות (מיון לפי row/col) */
export function quickGridSlotsInDisplayOrder(slots: LauncherSlot[]): LauncherSlot[] {
  const positioned = ensureQuickGridPositions(slots);
  return [...positioned]
    .filter((s) => s.widgetId !== null)
    .sort((a, b) => {
      const ar = a.row ?? 0;
      const br = b.row ?? 0;
      if (ar !== br) return ar - br;
      return (a.col ?? 0) - (b.col ?? 0);
    });
}

/**
 * מסדר אריחים ברשת hub — שורות של עד `cols` אריחים, שורה אחרונה ממורכזת.
 */
export function packQuickGridCentered(
  widgetIds: WidgetType[],
  cols = QUICK_GRID_HUB_COLS,
): LauncherSlot[] {
  if (widgetIds.length === 0) return [];
  const safeCols = Math.max(1, cols);
  const result: LauncherSlot[] = [];
  let index = 0;
  let row = 0;

  while (index < widgetIds.length) {
    const remaining = widgetIds.length - index;
    const tilesInRow = Math.min(safeCols, remaining);
    const colStart = Math.floor((safeCols - tilesInRow) / 2);

    for (let c = 0; c < tilesInRow; c++) {
      const widgetId = widgetIds[index];
      if (widgetId) {
        result.push({ widgetId, row, col: colStart + c });
      }
      index++;
    }
    row++;
  }

  return result;
}

/** מיישר קואורדינטות לרשת צפופה ממורכזת (אחרי עריכה או שמירה ישנה) */
export function normalizeQuickGridCoordinates(slots: LauncherSlot[]): LauncherSlot[] {
  const filled = slots.filter((s) => s.widgetId !== null);
  if (filled.length === 0) return [];

  const positioned = filled.every(slotHasGridPosition)
    ? filled
    : ensureQuickGridPositions(filled);

  const ordered = [...positioned]
    .filter((s) => s.widgetId !== null && slotHasGridPosition(s))
    .sort((a, b) => (a.row! - b.row!) || (a.col! - b.col!))
    .map((s) => s.widgetId!);

  return packQuickGridCentered(ordered);
}

export function finalizeQuickGridAfterEdit(slots: LauncherSlot[]): LauncherSlot[] {
  return normalizeQuickGridCoordinates(
    slots.filter((s) => s.widgetId !== null && slotHasGridPosition(s)),
  );
}
