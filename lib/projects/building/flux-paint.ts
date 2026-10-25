import { env } from "@/lib/env";
import { paidAiAllowed, type HouseSpend, spentSoFar, HOUSE_USD_TO_ILS_ESTIMATE } from "@/lib/projects/building/house-cost";
import { assertFluxPipelineReady, type FluxPipelinePackage, formatFluxPipelineGate } from "@/lib/projects/building/flux-pipeline-gate";

/**
 * FLUX.2 plan paint via Replicate (Pro / Max). Paid calls require ALLOW_PAID_AI=1
 * (or NEXT_RUNTIME) and a passing pipeline gate. No strength / negative_prompt fields.
 */

export type FluxEngine = "flux-2-pro" | "flux-2-max";

const MODEL: Record<FluxEngine, string> = {
  "flux-2-pro": "black-forest-labs/flux-2-pro",
  "flux-2-max": "black-forest-labs/flux-2-max",
};

/** Rough ₪ estimate for ceiling checks (Replicate MP pricing varies; keep conservative). */
export function estimateFluxPlanIls(engine: FluxEngine, inputImages: number): number {
  const base = engine === "flux-2-max" ? 0.16 : 0.075;
  const extras = Math.max(0, inputImages - 1) * (engine === "flux-2-max" ? 0.03 : 0.015);
  return (base + extras) * HOUSE_USD_TO_ILS_ESTIMATE;
}

function token(): string {
  const t = (env.REPLICATE_API_TOKEN ?? "").trim();
  if (!t) throw new Error("REPLICATE_API_TOKEN missing");
  return t;
}

function dataUri(buf: Buffer, mime = "image/jpeg"): string {
  return `data:${mime};base64,${buf.toString("base64")}`;
}

async function createPrediction(model: string, input: Record<string, unknown>): Promise<{ id: string; urls?: { get: string } }> {
  const res = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json", Prefer: "wait" },
    body: JSON.stringify({ input }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Replicate ${res.status}: ${body.slice(0, 400)}`);
  return JSON.parse(body) as { id: string; urls?: { get: string } };
}

async function pollPrediction(url: string): Promise<{ status: string; output?: unknown; error?: string }> {
  for (let i = 0; i < 120; i++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token()}` } });
    const j = (await res.json()) as { status: string; output?: unknown; error?: string; urls?: { get: string } };
    if (j.status === "succeeded" || j.status === "failed" || j.status === "canceled") return j;
    await new Promise((r) => setTimeout(r, 2_000));
  }
  throw new Error("Replicate prediction timed out");
}

function outputUrl(output: unknown): string {
  if (typeof output === "string") return output;
  if (Array.isArray(output) && typeof output[0] === "string") return output[0]!;
  throw new Error(`Unexpected Replicate output: ${JSON.stringify(output).slice(0, 200)}`);
}

export type FluxPaintResult = {
  image: Buffer;
  engine: FluxEngine;
  ilsEstimate: number;
  predictionId?: string;
};

/**
 * Paint one whole-floor plan. Throws if the gate fails or paid AI is not allowed.
 * Records a synthetic ledger line on spend when provided (estimate, not provider invoice).
 */
export async function paintFluxPlan(input: {
  pkg: FluxPipelinePackage;
  spend?: HouseSpend;
  /** When true, only validate and return null (no HTTP). */
  dryRun?: boolean;
}): Promise<FluxPaintResult | null> {
  const gate = assertFluxPipelineReady(input.pkg);
  if (!gate.ok) throw new Error(formatFluxPipelineGate(gate));

  const ils = estimateFluxPlanIls(input.pkg.engine, 1 + input.pkg.swatches.length);
  if (input.dryRun) return null;

  if (!paidAiAllowed()) throw new Error("FLUX paint blocked: set ALLOW_PAID_AI=1 (or run on server)");
  if (input.spend?.budgetIls != null) {
    const fluxAlready = input.spend.pictures.filter((p) => p.group === "flux").reduce((s, p) => s + p.ils, 0);
    const soFar = spentSoFar(input.spend).ils + input.spend.reservedIls + fluxAlready;
    if (soFar + ils > input.spend.budgetIls) throw new Error(`FLUX paint would exceed ceiling (need ~₪${ils.toFixed(2)}, left ₪${(input.spend.budgetIls - soFar).toFixed(2)})`);
  }

  const images = [dataUri(input.pkg.measured), ...input.pkg.swatches.map((s) => dataUri(s))];
  const replicateInput = {
    prompt: input.pkg.prompt,
    input_images: images,
    aspect_ratio: input.pkg.aspectRatio,
    resolution: "2 MP",
    output_format: input.pkg.outputFormat === "png" ? "png" : "jpg",
    output_quality: 100,
    safety_tolerance: 2,
    seed: input.pkg.seed,
  };

  const created = await createPrediction(MODEL[input.pkg.engine], replicateInput);
  const getUrl = created.urls?.get ?? `https://api.replicate.com/v1/predictions/${created.id}`;
  let final = created as { status?: string; output?: unknown; error?: string };
  if (!("output" in created) || !(created as { output?: unknown }).output) {
    final = await pollPrediction(getUrl);
  }
  if (final.status === "failed" || final.error) throw new Error(`FLUX failed: ${final.error ?? final.status}`);
  const url = outputUrl(final.output);
  const imgRes = await fetch(url);
  if (!imgRes.ok) throw new Error(`FLUX download ${imgRes.status}`);
  const image = Buffer.from(await imgRes.arrayBuffer());

  if (input.spend) {
    const usd = ils / HOUSE_USD_TO_ILS_ESTIMATE;
    input.spend.pictures.push({
      group: "flux",
      name: `flux-${input.pkg.engine}`,
      outcome: "painted",
      calls: 1,
      images: 1,
      usd,
      ils,
    });
  }

  return { image, engine: input.pkg.engine, ilsEstimate: ils, predictionId: created.id };
}

export { MODEL as FLUX_REPLICATE_MODELS };
