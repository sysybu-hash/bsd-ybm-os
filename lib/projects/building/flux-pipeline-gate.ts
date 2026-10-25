/**
 * Hard gate before any paid FLUX plan call: the package sent to the engine
 * must be complete and conflict-free (Gottlieb booklet plan, 16/10/2026).
 */

export type FluxPipelinePackage = {
  /** Measured whole-floor render (JPEG/PNG bytes). */
  measured: Buffer;
  /** Floor-finish swatches cut from the same render (2–4 expected). */
  swatches: Buffer[];
  /** Full prompt that will be sent (must already include inventory when required). */
  prompt: string;
  /** HOUSE_PLAN_GOLDEN=1 path. */
  golden: boolean;
  /** Inventory paragraph was attached (from DXF / truth). */
  inventoryAttached: boolean;
  seed: number;
  aspectRatio: "match_input_image";
  outputFormat: "png" | "jpg";
  /** Engine id for logging. */
  engine: "flux-2-pro" | "flux-2-max";
};

export type FluxPipelineGateResult =
  | { ok: true; checklist: Record<string, true> }
  | { ok: false; faults: string[]; checklist: Record<string, boolean> };

const EVEN_LIGHT_MARKERS = [
  "soft, even, warm daylight from straight above",
  "free of cast sunbeams",
  "LIGHT, THE SAME IN EVERY PART",
];

const FORBIDDEN_SOFT = [/\bimprove the design\b/i, /\badd rugs\b/i, /\badd plants\b/i, /\binvent furniture\b/i];

/** Validate the package that will hit Replicate. Never call paid AI when ok is false. */
export function assertFluxPipelineReady(pkg: FluxPipelinePackage): FluxPipelineGateResult {
  const checklist: Record<string, boolean> = {
    measuredPresent: pkg.measured.length > 1_000,
    swatchesCount: pkg.swatches.length >= 2 && pkg.swatches.length <= 6,
    swatchesNonEmpty: pkg.swatches.every((s) => s.length > 100),
    inventoryAttached: pkg.inventoryAttached && /INVENTORY FROM THE DRAWING/i.test(pkg.prompt),
    goldenWhenRequired: !pkg.golden || /GOLDEN HOUR|WARM AND BRIGHT|warm and bright/i.test(pkg.prompt),
    noEvenConflictWhenGolden: !pkg.golden || !EVEN_LIGHT_MARKERS.some((m) => pkg.prompt.includes(m)),
    noSoftInvent: !FORBIDDEN_SOFT.some((re) => re.test(pkg.prompt)),
    lockLanguage: /re-surface the render only|sole authority|do not invent/i.test(pkg.prompt),
    stairsRule: /U-stair|two flights|walk line/i.test(pkg.prompt),
    balconyRule: /glass railing|slim black/i.test(pkg.prompt),
    noRoomLabels: /free of room names|never burn room-name/i.test(pkg.prompt),
    seedSet: Number.isFinite(pkg.seed),
    aspectMatch: pkg.aspectRatio === "match_input_image",
    outputOk: pkg.outputFormat === "png" || pkg.outputFormat === "jpg",
    engineOk: pkg.engine === "flux-2-pro" || pkg.engine === "flux-2-max",
  };

  const faults = Object.entries(checklist)
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (faults.length) return { ok: false, faults, checklist };
  return { ok: true, checklist: checklist as Record<string, true> };
}

/** Human-readable gate report for dry-run files. */
export function formatFluxPipelineGate(result: FluxPipelineGateResult): string {
  const lines = Object.entries(result.checklist).map(([k, v]) => `${v ? "OK" : "FAIL"}  ${k}`);
  if (result.ok) return ["FLUX pipeline gate: PASS", ...lines].join("\n");
  return ["FLUX pipeline gate: BLOCKED — do not set ALLOW_PAID_AI", ...lines, `faults: ${result.faults.join(", ")}`].join("\n");
}
