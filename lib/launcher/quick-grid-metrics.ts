/** מידות, קבועים וסגנונות רשת ה-quick grid — פוצל מ-quick-grid.ts */
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

/**
 * רשת עריכה: עמודות ברוחב אריח קבוע (לא מתכווצות) + רוחב max-content,
 * כדי שבמובייל האריחים יישארו קריאים והקנבס ייגלל אופקית במקום להידחס.
 */
export function quickGridEditInlineStyle(cols: number, _rows: number): QuickGridInlineStyle {
  const gapPx = LAUNCHER_GRID_GAP_PX;
  const maxW = quickGridDesktopWidthPx(cols);
  return {
    width: "max-content",
    maxWidth: `${maxW}px`,
    gridTemplateColumns: `repeat(${cols}, ${LAUNCHER_TILE_PX}px)`,
    columnGap: `${gapPx}px`,
    rowGap: `${gapPx}px`,
  };
}

/** רוחב מקסימלי לרשת 4 עמודות (Hub) */
export const LAUNCHER_QUICK_DESKTOP_MAX_WIDTH_PX = quickGridDesktopWidthPx(QUICK_GRID_HUB_COLS);

