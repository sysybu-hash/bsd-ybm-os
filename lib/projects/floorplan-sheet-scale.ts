import {
  isAnthropicConfigured,
  isGeminiConfigured,
  isOpenAiConfigured,
} from "@/lib/ai-providers";
import { extractDocumentWithAnthropic } from "@/lib/ai-extract-anthropic";
import { extractDocumentWithOpenAI } from "@/lib/ai-extract-openai";
import { getFloorplanLayoutModelChain } from "@/lib/gemini-model";
import { createLogger } from "@/lib/logger";
import { geminiMultimodal } from "@/lib/tri-engine-extract";
import { floorplanSourceFileName } from "@/lib/projects/floorplan-photo-prep";
import { recordFloorplanSpend, type FloorplanSpend } from "@/lib/projects/floorplan-spend";

const log = createLogger("floorplan-sheet-scale");

/**
 * Scale from the dimension chains, for a sheet that prints no area.
 *
 * The CAD route needs to know how many drawing units make a metre. It got
 * that by searching for the scale whose enclosed area reproduces the gross
 * the sheet prints — and a sheet that prints no gross, or prints it as vector
 * outlines with no text layer, had no way in at all. That is how a fully
 * vectorial plan ended up painted by eye, with its shelter room missing and
 * its rooms rearranged.
 *
 * The chains are on the sheet whether or not there is text to read: two
 * numbers (the overall width and depth in centimetres) against the drawing's
 * own extent give the scale directly. The reading is checked against the
 * extent's proportions before it is trusted — a misread number changes the
 * aspect ratio, and that is what makes it catchable.
 */
const SCALE_INSTRUCTION = `
You are reading an Israeli architectural floor plan (תוכנית דירה).

Along the edges of the drawing there are dimension chains: rows of numbers in
CENTIMETRES, each measuring one segment of the outer wall.

Sum the chain that runs along the TOP or BOTTOM edge to get the unit's overall
exterior WIDTH, and the chain along the LEFT or RIGHT edge to get its overall
exterior DEPTH. Use the outermost chain — the one that spans the whole plan.

Return JSON only, no prose:
{"widthCm": <number>, "depthCm": <number>, "chainWidth": [<numbers you summed>], "chainDepth": [<numbers you summed>]}

If no dimension chain is legible, return {"widthCm": 0, "depthCm": 0}.
`.trim();

export type SheetScaleReading = {
  unitsPerMetre: number;
  widthM: number;
  depthM: number;
  engine: string;
};

function numberFrom(value: unknown): number {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Centimetres, unless the sheet dimensions in metres — both appear in the
 * wild, and a flat is never 11 cm or 1,160 m across.
 */
function metresFrom(raw: number): number {
  if (raw >= 300 && raw <= 6000) return raw / 100;
  if (raw >= 3 && raw <= 60) return raw;
  return 0;
}

export async function readSheetScale(
  base64: string,
  mimeType: string,
  extent: { width: number; height: number },
  options?: { spend?: FloorplanSpend; tolerance?: number },
): Promise<SheetScaleReading | null> {
  if (!(extent.width > 0) || !(extent.height > 0)) return null;
  const fileName = floorplanSourceFileName(mimeType);
  const engines: Array<{ name: string; run: () => Promise<unknown> }> = [];
  if (isGeminiConfigured()) {
    engines.push({
      name: "gemini",
      run: () => geminiMultimodal(base64, mimeType, SCALE_INSTRUCTION, getFloorplanLayoutModelChain()),
    });
  }
  if (isAnthropicConfigured()) {
    engines.push({
      name: "anthropic",
      run: () => extractDocumentWithAnthropic(base64, mimeType, fileName, SCALE_INSTRUCTION),
    });
  }
  if (isOpenAiConfigured()) {
    engines.push({
      name: "openai",
      run: () => extractDocumentWithOpenAI(base64, mimeType, fileName, SCALE_INSTRUCTION),
    });
  }

  const tolerance = options?.tolerance ?? 0.1;
  for (const engine of engines) {
    try {
      if (options?.spend) recordFloorplanSpend(options.spend, "extract", `sheet-scale-${engine.name}`);
      const raw = (await engine.run()) as Record<string, unknown>;
      const widthM = metresFrom(numberFrom(raw?.widthCm));
      const depthM = metresFrom(numberFrom(raw?.depthCm));
      if (!widthM || !depthM) continue;

      // The drawing's own proportions are the check on the reading: a chain
      // summed wrong lands on a flat of the wrong shape, and the two scales
      // the two edges imply then disagree.
      const fromWidth = extent.width / widthM;
      const fromDepth = extent.height / depthM;
      const disagreement = Math.abs(fromWidth - fromDepth) / Math.max(fromWidth, fromDepth);
      if (disagreement > tolerance) {
        log.warn("sheet scale reading disagrees with the drawing's proportions", {
          engine: engine.name,
          widthM,
          depthM,
          fromWidth,
          fromDepth,
        });
        continue;
      }
      const unitsPerMetre = (fromWidth + fromDepth) / 2;
      log.info("sheet scale read from the dimension chains", {
        engine: engine.name,
        widthM,
        depthM,
        unitsPerMetre,
      });
      return { unitsPerMetre, widthM, depthM, engine: engine.name };
    } catch (err: unknown) {
      log.warn("sheet scale engine failed", {
        engine: engine.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return null;
}
