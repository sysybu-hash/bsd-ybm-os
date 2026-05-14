/** מפתח השוואה גס למוצר — להרחבה עתידית ל-fuzzy matching */
export function normalizeProductKey(description: string): string {
  return description
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/["'`]/g, "")
    .slice(0, 160);
}
