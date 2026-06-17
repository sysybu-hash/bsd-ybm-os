import type { BlueprintAnalysis } from "@/lib/projects/blueprint-analysis-schema";
import type { BillOfQuantityRowV5, ScanExtractionV5 } from "@/lib/scan-schema-v5";
import { analyzeBlueprintFile } from "@/lib/projects/blueprint-analyze";
import { createLogger } from "@/lib/logger";

const log = createLogger("blueprint-v5-enrich");

function blueprintBoqToV5Rows(analysis: BlueprintAnalysis): BillOfQuantityRowV5[] {
  return analysis.boqLineItems.map((row) => ({
    itemRef: null,
    description: row.description,
    material: null,
    dimensions: null,
    mepPoints: null,
    quantity: row.quantity ?? null,
    unit: row.unit ?? null,
    notes: row.note ?? null,
  }));
}

function mergeBoqRows(
  primary: BillOfQuantityRowV5[],
  secondary: BillOfQuantityRowV5[],
): BillOfQuantityRowV5[] {
  const seen = new Set(primary.map((r) => `${r.description}|${r.unit}|${r.quantity}`));
  const merged = [...primary];
  for (const row of secondary) {
    const key = `${row.description}|${row.unit}|${row.quantity}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(row);
    }
  }
  return merged;
}

/**
 * משלב פלט analyzeBlueprintFile (מסלול פרויקט) לתוך ScanExtractionV5 אחרי Tri-Engine.
 */
export async function enrichDrawingBoqWithBlueprintAnalyzer(
  base64: string,
  mimeType: string,
  v5: ScanExtractionV5,
): Promise<ScanExtractionV5> {
  try {
    const blueprint = await analyzeBlueprintFile(base64, mimeType);
    const extraBoq = blueprintBoqToV5Rows(blueprint);
    if (extraBoq.length === 0) return v5;

    const billOfQuantities = mergeBoqRows(v5.billOfQuantities ?? [], extraBoq);
    const lineItems = [
      ...(v5.lineItems ?? []),
      ...extraBoq.map((r) => ({
        description: r.description,
        quantity: r.quantity ?? 1,
        unitPrice: 0,
      })),
    ];

    return {
      ...v5,
      billOfQuantities,
      lineItems,
    };
  } catch (err: unknown) {
    log.warn("blueprint enrich skipped", {
      error: err instanceof Error ? err.message : String(err),
    });
    return v5;
  }
}
