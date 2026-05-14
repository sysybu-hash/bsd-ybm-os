/**
 * ציון פענוח לצורך בחירת "תוצאה מומלצת" בין מנועים (ללא קריאה ל-LLM נוסף).
 */
export function scoreExtractedDocument(ai: Record<string, unknown> | undefined): number {
  if (!ai || typeof ai !== "object") return 0;
  let s = 0;
  const vendor = ai.vendor;
  if (typeof vendor === "string" && vendor.trim().length > 1) s += 3;
  const total = ai.total;
  let numericTotal = 0;
  if (typeof total === "number" && Number.isFinite(total) && total > 0) {
    s += 3;
    numericTotal = total;
  } else if (typeof total === "string" && total.trim()) {
    const n = parseFloat(total.replace(/,/g, ""));
    if (Number.isFinite(n) && n > 0) {
      s += 2;
      numericTotal = n;
    }
  }

  const meta = ai.metadata;
  if (meta && typeof meta === "object") s += 2;
  const boq = ai.billOfQuantities;
  if (Array.isArray(boq)) s += Math.min(8, boq.length);

  const lineItems = ai.lineItems;
  if (Array.isArray(lineItems)) {
    s += Math.min(6, lineItems.length * 2);
    // Financial Validation Bonus: if sum of items == total
    const itemsSum = lineItems.reduce((acc: number, item: any) => {
      const p = parseFloat(String(item.price || 0));
      const q = parseFloat(String(item.qty || 1));
      return acc + (p * q);
    }, 0);
    if (numericTotal > 0 && Math.abs(numericTotal - itemsSum) < 0.1) {
      s += 10; // Major confidence boost
    }
  }
  const summary = ai.summary;
  if (typeof summary === "string" && summary.trim().length > 15) s += 2;
  const docType = ai.docType;
  if (typeof docType === "string" && docType.trim()) s += 1;
  return s;
}

export function pickBestEngineIndex(
  engines: { ok: boolean; aiData?: Record<string, unknown> }[],
): number {
  let best = -1;
  let bestScore = -1;
  engines.forEach((e, i) => {
    if (!e.ok) return;
    const sc = scoreExtractedDocument(e.aiData);
    if (sc > bestScore) {
      bestScore = sc;
      best = i;
    }
  });
  return best;
}
