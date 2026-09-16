export type FloorplanVizEditRegion = {
  x: number;
  y: number;
  w: number;
  h: number;
};

const MIN_SIDE = 0.02;

function num(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

/** Normalized rectangle in the still (origin top-left). Rejects empty marks. */
export function clampFloorplanVizEditRegion(raw: unknown): FloorplanVizEditRegion | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const x0 = num(row.x);
  const y0 = num(row.y);
  const w0 = num(row.w);
  const h0 = num(row.h);
  if (x0 == null || y0 == null || w0 == null || h0 == null) return null;
  const x = Math.min(1, Math.max(0, x0));
  const y = Math.min(1, Math.max(0, y0));
  const w = Math.min(1 - x, Math.max(0, w0));
  const h = Math.min(1 - y, Math.max(0, h0));
  const round = (n: number) => Math.round(n * 10000) / 10000;
  if (w < MIN_SIDE || h < MIN_SIDE) return null;
  return { x: round(x), y: round(y), w: round(w), h: round(h) };
}

export function editRegionPromptBlock(region: FloorplanVizEditRegion): string {
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  return `LOCATOR: the operator marked a rectangle on the still — left ${pct(region.x)}, top ${pct(region.y)}, width ${pct(region.w)}, height ${pct(region.h)} of the frame (origin is the top-left of the image).
The SECOND attached image is a BLACK MASK with a magenta rectangle on that mark — it is not the apartment. Change ONLY what sits inside that rectangle on the FIRST image. Do not copy the magenta stroke, fill, mask, arrows or labels into the output. Pixels outside the rectangle stay as in the FIRST attached image.`;
}

export function formatFloorplanVizEditPrompt(
  instruction: string,
  region?: FloorplanVizEditRegion | null,
): string {
  if (!region) return instruction;
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  return `${instruction} [${pct(region.x)},${pct(region.y)} ${pct(region.w)}×${pct(region.h)}]`;
}
