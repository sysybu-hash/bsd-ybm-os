/** מעריך ביטוי מתמטי בטוח — מספרים, אופרטורים, Math.* */
export function evalExpression(expr: string): number | null {
  const trimmed = expr.trim();
  if (!trimmed) return null;

  try {
    const normalized = trimmed
      .replace(/×/g, "*")
      .replace(/÷/g, "/")
      .replace(/π/g, "Math.PI")
      .replace(/\^/g, "**");

    if (!/^[\d\s+\-*/().,A-Za-z]+$/.test(normalized)) return null;

    const result = new Function(`"use strict"; return (${normalized})`)() as unknown;
    return typeof result === "number" && Number.isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

/** ממיר מעלות לרדיאנים לפונקציות trig במצב מדעי (קלט במעלות) */
export function evalScientificExpression(expr: string): number | null {
  let normalized = expr.trim();
  if (!normalized) return null;

  normalized = normalized
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/π/g, "Math.PI")
    .replace(/\^/g, "**")
    .replace(/√\(([^)]+)\)/g, "Math.sqrt($1)")
    .replace(/√(\d+(\.\d+)?)/g, "Math.sqrt($1)");

  const trigWrap = (fn: string) => {
    const re = new RegExp(`${fn}\\(([^)]+)\\)`, "g");
    normalized = normalized.replace(re, (_, inner: string) => {
      return `Math.${fn}((${inner}) * Math.PI / 180)`;
    });
  };

  trigWrap("sin");
  trigWrap("cos");
  trigWrap("tan");

  return evalExpression(normalized);
}
