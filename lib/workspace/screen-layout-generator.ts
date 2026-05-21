import { computeBalancedRowSizes } from "@/lib/launcher/launcher-grid-layout";

export type WorkspaceBounds = { width: number; height: number };

export type LayoutCell = {
  position: { x: number; y: number };
  size: { width: number; height: number };
};

export type OpenWidgetRef = { id: string };

/** שוליים פנימיים + רווח בין אריחים */
export const TILE_PADDING_PX = 12;
export const TILE_GUTTER_PX = 14;

const MIN_TILE_WIDTH = 240;
const MIN_TILE_HEIGHT = 200;
const NARROW_WORKSPACE_WIDTH = 960;
const WIDE_ASPECT_RATIO = 1.15;

export type ProfessionalGridRow = { cols: number };

/** מפרט שורות/עמודות לפי כמות חלונות ויחס רוחב/גובה */
export function computeProfessionalGrid(
  count: number,
  bounds: WorkspaceBounds,
): ProfessionalGridRow[] {
  if (count <= 0) return [];
  const aspect = bounds.width / Math.max(1, bounds.height);
  const narrow = bounds.width < NARROW_WORKSPACE_WIDTH;
  const wide = aspect >= WIDE_ASPECT_RATIO && !narrow;

  if (count === 1) return [{ cols: 1 }];
  if (count === 2) return [{ cols: 2 }];
  if (count === 3) {
    if (narrow) return [{ cols: 2 }, { cols: 1 }];
    return [{ cols: 3 }];
  }
  if (count === 4) return [{ cols: 2 }, { cols: 2 }];
  if (count === 5) {
    if (narrow || !wide) return [{ cols: 2 }, { cols: 3 }];
    return [{ cols: 3 }, { cols: 2 }];
  }
  if (count === 6) {
    if (wide) return [{ cols: 3 }, { cols: 3 }];
    return [{ cols: 2 }, { cols: 2 }, { cols: 2 }];
  }

  const maxCols = narrow ? 2 : wide ? 3 : 2;
  const rowSizes = computeBalancedRowSizes(count, maxCols);
  return rowSizes.map((cols) => ({ cols }));
}

/** @deprecated השתמשו ב־computeProfessionalGrid — נשמר לתאימות בדיקות */
export function computeProfessionalRowSizes(count: number): number[] {
  return computeProfessionalGrid(count, { width: 1400, height: 900 }).map(
    (r) => r.cols,
  );
}

type Rect = { x: number; y: number; width: number; height: number };

export function layoutCellsOverlap(a: Rect, b: Rect): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

export function isLayoutWithinBounds(
  cells: LayoutCell[],
  bounds: WorkspaceBounds,
): boolean {
  for (const cell of cells) {
    if (cell.position.x < 0 || cell.position.y < 0) return false;
    if (cell.position.x + cell.size.width > bounds.width + 1) return false;
    if (cell.position.y + cell.size.height > bounds.height + 1) return false;
  }
  return true;
}

export function layoutHasNoOverlaps(cells: LayoutCell[]): boolean {
  const rects: Rect[] = cells.map((c) => ({
    x: c.position.x,
    y: c.position.y,
    width: c.size.width,
    height: c.size.height,
  }));
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      if (layoutCellsOverlap(rects[i]!, rects[j]!)) return false;
    }
  }
  return true;
}

function clampCellToBounds(
  cell: LayoutCell,
  bounds: WorkspaceBounds,
): LayoutCell {
  const maxW = Math.max(MIN_TILE_WIDTH, bounds.width);
  const maxH = Math.max(MIN_TILE_HEIGHT, bounds.height);
  const width = Math.min(cell.size.width, maxW);
  const height = Math.min(cell.size.height, maxH);
  const maxX = Math.max(0, bounds.width - width);
  const maxY = Math.max(0, bounds.height - height);
  return {
    size: { width, height },
    position: {
      x: Math.max(0, Math.min(cell.position.x, maxX)),
      y: Math.max(0, Math.min(cell.position.y, maxY)),
    },
  };
}

/**
 * מחשב position+size לכל חלון — גריד אחיד, ללא חפיפה, ממלא את אזור העבודה.
 */
export function computeProfessionalLayout(
  openWidgets: OpenWidgetRef[],
  workspaceBounds: WorkspaceBounds,
): Map<string, LayoutCell> {
  const result = new Map<string, LayoutCell>();
  const n = openWidgets.length;
  if (n === 0) return result;

  const boundsW = Math.max(320, workspaceBounds.width);
  const boundsH = Math.max(280, workspaceBounds.height);
  const innerW = Math.max(
    MIN_TILE_WIDTH,
    boundsW - TILE_PADDING_PX * 2,
  );
  const innerH = Math.max(
    MIN_TILE_HEIGHT,
    boundsH - TILE_PADDING_PX * 2,
  );

  if (n === 1) {
    const id = openWidgets[0]!.id;
    const width = Math.max(
      MIN_TILE_WIDTH,
      Math.min(innerW, Math.round(innerW * 0.96)),
    );
    const height = Math.max(
      MIN_TILE_HEIGHT,
      Math.min(innerH, Math.round(innerH * 0.94)),
    );
    result.set(
      id,
      clampCellToBounds(
        {
          size: { width, height },
          position: {
            x: TILE_PADDING_PX + Math.round((innerW - width) / 2),
            y: TILE_PADDING_PX + Math.round((innerH - height) / 2),
          },
        },
        { width: boundsW, height: boundsH },
      ),
    );
    return result;
  }

  const grid = computeProfessionalGrid(n, { width: boundsW, height: boundsH });
  const numRows = grid.length;
  const maxCols = Math.max(...grid.map((r) => r.cols), 1);

  const cellW = Math.max(
    MIN_TILE_WIDTH,
    Math.floor((innerW - TILE_GUTTER_PX * (maxCols - 1)) / maxCols),
  );
  const cellH = Math.max(
    MIN_TILE_HEIGHT,
    Math.floor((innerH - TILE_GUTTER_PX * (numRows - 1)) / numRows),
  );

  let index = 0;
  for (let row = 0; row < numRows; row++) {
    const colsInRow = grid[row]!.cols;
    const rowWidth = colsInRow * cellW + TILE_GUTTER_PX * (colsInRow - 1);
    const rowStartX =
      TILE_PADDING_PX + Math.max(0, Math.round((innerW - rowWidth) / 2));
    const y = TILE_PADDING_PX + row * (cellH + TILE_GUTTER_PX);

    for (let col = 0; col < colsInRow; col++) {
      const widget = openWidgets[index];
      if (!widget) break;
      const x = rowStartX + col * (cellW + TILE_GUTTER_PX);
      result.set(
        widget.id,
        clampCellToBounds(
          {
            position: { x, y },
            size: { width: cellW, height: cellH },
          },
          { width: boundsW, height: boundsH },
        ),
      );
      index++;
    }
  }

  return result;
}
