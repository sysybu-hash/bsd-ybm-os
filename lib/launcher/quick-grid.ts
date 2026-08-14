import type { WidgetType } from "@/hooks/use-window-manager";
import type { LauncherSlot } from "@/lib/launcher/user-launcher-config";
import { QUICK_GRID_HUB_COLS } from "@/lib/launcher/quick-grid-metrics";
import {
  ensureQuickGridPositions,
  slotHasGridPosition,
} from "@/lib/launcher/quick-grid-slots";

export * from "@/lib/launcher/quick-grid-metrics";
export * from "@/lib/launcher/quick-grid-slots";
export * from "@/lib/launcher/quick-grid-edit";
/** ׳¡׳“׳¨ ׳×׳¦׳•׳’׳” ׳׳©׳•׳¨׳•׳× ׳׳׳•׳–׳ ׳•׳× (׳׳™׳•׳ ׳׳₪׳™ row/col) */
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
 * ׳׳¡׳“׳¨ ׳׳¨׳™׳—׳™׳ ׳‘׳¨׳©׳× hub ג€” ׳©׳•׳¨׳•׳× ׳©׳ ׳¢׳“ `cols` ׳׳¨׳™׳—׳™׳, ׳©׳•׳¨׳” ׳׳—׳¨׳•׳ ׳” ׳׳׳•׳¨׳›׳–׳×.
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

/** ׳׳™׳™׳©׳¨ ׳§׳•׳׳•׳¨׳“׳™׳ ׳˜׳•׳× ׳׳¨׳©׳× ׳¦׳₪׳•׳₪׳” ׳׳׳•׳¨׳›׳–׳× (׳׳—׳¨׳™ ׳¢׳¨׳™׳›׳” ׳׳• ׳©׳׳™׳¨׳” ׳™׳©׳ ׳”) */
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

