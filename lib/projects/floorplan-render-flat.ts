import { GoogleGenAI } from "@google/genai";
import sharp from "sharp";

import { getGeminiApiKey } from "@/lib/gemini-api-key";
import { getFloorplanVizModelChain } from "@/lib/gemini-model";
import { createLogger } from "@/lib/logger";
import { buildFlatFromPdf, type BuiltFlat } from "@/lib/projects/floorplan-build";
import {
  assessFloorplanRun,
  type ConfidenceReport,
} from "@/lib/projects/floorplan-confidence";
import { pickBestFinish } from "@/lib/projects/floorplan-finish";
import {
  fidelityFailures,
  measureBlockFidelity,
  type FidelityReport,
} from "@/lib/projects/floorplan-fidelity";
import { parseFloorplanLayout } from "@/lib/projects/floorplan-layout";
import {
  buildPlacementPrompt,
  RECOLOUR_PROMPT,
} from "@/lib/projects/floorplan-materials";
import {
  segmentRooms,
  type SegmentedRoom,
} from "@/lib/projects/floorplan-segment";
import { hatchedWallExtent } from "@/lib/projects/floorplan-solid";
import { coolTintFraction, TINT_LIMIT } from "@/lib/projects/floorplan-tint";
import {
  extractFloorplanVectorGeometry,
  wallBoundingBox,
} from "@/lib/projects/floorplan-vector";
import {
  auditFloorplanStill,
  gradeFloorplanStill,
} from "@/lib/projects/floorplan-viz-audit";

const log = createLogger("floorplan-render-flat");

/**
 * The whole geometric render, in one place both callers can reach.
 *
 * This pipeline was built inside a CLI script, and it stayed there: nothing in
 * app/ or components/ imported buildFlatFromPdf or the calibrated prompts, so
 * a person uploading a plan through the interface got the older path — a wall
 * diagram handed to the model with "draw a flat from this" — which is the
 * approach that produced invented rooms and mirrored plans for weeks.
 *
 * Everything the CLI learned lives here now: the geometry, the two model
 * passes, best-of-N over a fixed plan, the per-block fidelity check, and the
 * verdict on whether the result is fit to sell. The script is a thin wrapper,
 * and the app can call the same function.
 */
export type RenderedFlat = {
  flat: BuiltFlat;
  rooms: SegmentedRoom[];
  /** The deterministic render, as JPEG. */
  geometry: Buffer;
  /** The finish, before any caption is stamped on it. */
  still: { mimeType: string; base64: string };
  score: number;
  failures: string[];
  attempts: number;
  fidelity: FidelityReport;
  coolTint: number;
  confidence: ConfidenceReport;
};

export type RenderFlatOptions = {
  /** Gross printed area, plus any terrace area on the flat's own level. */
  targetAreaM2: number;
  /** The flat's extent, when the sheet carries more than one apartment. */
  extent?: { x: number; y: number; width: number; height: number };
  /**
   * The sheet the walls are read from, when the caller has an uncut copy.
   * A crop severs wall faces mid-run and costs about 13 points of coverage.
   */
  wallSource?: Buffer | Uint8Array;
  attempts?: number;
  goodEnough?: number;
  haredi?: boolean;
  /** Appended to the materials prompt; it licenses no change to the geometry. */
  styleDirection?: string;
  label?: string;
};

/** One image call against the model chain, given a prompt and a source frame. */
async function imagePass(
  client: GoogleGenAI,
  text: string,
  image: { mimeType: string; base64: string },
): Promise<{ mimeType: string; base64: string } | null> {
  for (const model of getFloorplanVizModelChain()) {
    try {
      const res = await client.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              { text },
              { inlineData: { mimeType: image.mimeType, data: image.base64 } },
            ],
          },
        ],
        config: { responseModalities: ["IMAGE"] },
      });
      const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
      const data = part?.inlineData?.data;
      if (data) return { mimeType: "image/jpeg", base64: data };
    } catch {
      // Try the next model in the chain.
    }
  }
  return null;
}

/**
 * The flat's extent on a sheet that may carry more than one.
 *
 * wallBoundingBox measures every segment that survived the wall filters, and
 * those include dimension chains running well past the apartment.
 */
export async function flatExtentFromSheet(
  sheetPdf: Buffer | Uint8Array,
): Promise<{ x: number; y: number; width: number; height: number } | null> {
  const geometry = await extractFloorplanVectorGeometry(sheetPdf);
  if (!geometry) return null;
  const box = wallBoundingBox(geometry);
  if (!box) return null;
  return hatchedWallExtent(geometry.segments, box, 53) ?? box;
}

export async function renderFlatFromPdf(
  pdf: Buffer | Uint8Array,
  options: RenderFlatOptions,
): Promise<RenderedFlat | null> {
  const wallSource = options.wallSource ?? pdf;
  const flat = await buildFlatFromPdf(wallSource, options.targetAreaM2, {
    extent: options.extent,
  });
  if (!flat) {
    log.warn("no scale reproduces the printed area", {
      label: options.label,
      targetAreaM2: options.targetAreaM2,
    });
    return null;
  }

  const sheet = await extractFloorplanVectorGeometry(pdf);
  const rooms = segmentRooms({
    bodies: flat.bodies,
    openings: flat.openings,
    floor: flat.floor,
    furniture: flat.furniture,
    terraces: flat.terraces,
    bounds: flat.bounds,
    unitsPerMetre: flat.unitsPerMetre,
    segments: sheet?.segments,
  });

  const geometry = await sharp(Buffer.from(flat.svg), { density: 200 })
    .flatten({ background: "#fff" })
    .jpeg({ quality: 94 })
    .toBuffer();

  const client = new GoogleGenAI({ apiKey: getGeminiApiKey() });
  const prompt = buildPlacementPrompt(options.styleDirection);
  const plan = {
    base64: Buffer.from(pdf).toString("base64"),
    mimeType: "application/pdf",
  };
  const layout = parseFloorplanLayout({ rooms: [], islandStoolCount: 0 });
  const drawnBeds = flat.furniture.filter((p) => p.kind === "bed").length;

  // Placement, then recolour. The sanitary blocks have to be a cool aqua to be
  // separable from bed linen at all — two parts in 255 apart and the beds came
  // back as bathtubs — and the second pass takes that tint out again. Asked to
  // do both at once the model does neither reliably.
  const render = async () => {
    const placed = await imagePass(client, prompt, {
      mimeType: "image/jpeg",
      base64: geometry.toString("base64"),
    });
    if (!placed) return null;
    return (await imagePass(client, RECOLOUR_PROMPT, placed)) ?? placed;
  };

  const grade = async (image: { mimeType: string; base64: string }) => {
    const audit = await auditFloorplanStill(image, plan);
    if (!audit) return null;
    const verdict = gradeFloorplanStill(audit, layout, {
      haredi: options.haredi ?? false,
      drawn: { beds: drawnBeds },
    });
    const tint = await coolTintFraction(image);
    const fidelity = await measureBlockFidelity({
      geometry,
      still: Buffer.from(image.base64, "base64"),
      furniture: flat.furniture,
      bounds: flat.bounds,
    });
    const failures = [...verdict.failures, ...fidelityFailures(fidelity)];
    let score = verdict.score + (fidelity.total - fidelity.present);
    if (tint > TINT_LIMIT) {
      failures.push(`coding tint left in ${(tint * 100).toFixed(1)}% of the frame`);
      score += 100;
    } else {
      // Below the limit it still breaks ties: two frames with the same failures
      // are not equally good if one has a faintly green chair in it.
      score += tint * 10;
    }
    return { score, failures, hardFailures: verdict.hardFailures };
  };

  const best = await pickBestFinish(options.attempts ?? 4, render, grade, {
    goodEnough: options.goodEnough,
    label: options.label,
  });
  if (!best) return null;

  // Measured again on the chosen frame: the running values belong to whichever
  // attempt was graded last, which is not necessarily the one that won.
  const fidelity = await measureBlockFidelity({
    geometry,
    still: Buffer.from(best.image.base64, "base64"),
    furniture: flat.furniture,
    bounds: flat.bounds,
  });
  const coolTint = await coolTintFraction(best.image);

  const confidence = assessFloorplanRun({
    areaError: flat.areaError,
    unitsPerMetre: flat.unitsPerMetre,
    wallCount: flat.bodies.length,
    furniture: flat.furniture,
    rooms,
    fidelity,
    coolTint,
    foundTerraces: flat.terraces.length,
    auditHardFailures: best.hardFailures,
  });

  return {
    flat,
    rooms,
    geometry,
    still: best.image,
    score: best.score,
    failures: best.failures,
    attempts: best.attempts,
    fidelity,
    coolTint,
    confidence,
  };
}
