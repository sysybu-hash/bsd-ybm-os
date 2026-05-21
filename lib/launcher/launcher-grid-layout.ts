/** מקסימום אריחים בשורה — תואם לרוחב ~140px ב־max-w-6xl */
export const LAUNCHER_QUICK_MAX_PER_ROW = 7;

/**
 * מחשב גדלי שורות מאוזנים: שורות שוות ככל האפשר, שורה אחרונה ממורכזת (ב־CSS),
 * ומניעת שורה ראשונה עמוסה + יחיד בודד ב־RTL.
 */
export function computeBalancedRowSizes(n: number, maxPerRow = LAUNCHER_QUICK_MAX_PER_ROW): number[] {
  if (n <= 0) return [];
  if (n === 1) return [1];

  const half = n / 2;
  if (n % 2 === 0 && half <= maxPerRow) {
    return [half, half];
  }

  if (n % 2 === 1 && n >= 5) {
    const pair = (n - 1) / 2;
    if (pair <= maxPerRow) {
      return [pair, pair, 1];
    }
  }

  let numRows = Math.ceil(n / maxPerRow);
  while (numRows <= n) {
    const sizes: number[] = [];
    let left = n;
    for (let r = 0; r < numRows; r++) {
      const rowsRemaining = numRows - r;
      const size = Math.ceil(left / rowsRemaining);
      const clamped = Math.min(size, maxPerRow);
      sizes.push(clamped);
      left -= clamped;
    }

    const sum = sizes.reduce((a, b) => a + b, 0);
    if (sum === n && sizes.every((s) => s <= maxPerRow)) {
      const last = sizes[sizes.length - 1]!;
      const maxSize = Math.max(...sizes);
      if (last === 1 && maxSize >= 4 && numRows < n) {
        numRows++;
        continue;
      }
      return sizes;
    }
    numRows++;
  }

  return [n];
}

/** מפצל מערך לשורות לפי computeBalancedRowSizes */
export function splitIntoBalancedRows<T>(
  items: T[],
  maxPerRow = LAUNCHER_QUICK_MAX_PER_ROW,
): T[][] {
  if (items.length === 0) return [];
  const sizes = computeBalancedRowSizes(items.length, maxPerRow);
  const rows: T[][] = [];
  let offset = 0;
  for (const size of sizes) {
    rows.push(items.slice(offset, offset + size));
    offset += size;
  }
  return rows;
}
