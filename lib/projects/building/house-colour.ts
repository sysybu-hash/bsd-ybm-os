import sharp from "sharp";

/**
 * A house's render with its colours brought up. Lit for the golden hour and
 * tone-mapped, the plan came out washed — near-white floors, grey shadow, the
 * oak and the lawn faded — and the client asked for it "more colourful, more
 * alive" (Gottlieb, 13/10/2026). Saturation up, a touch more contrast; the
 * interiors, whose plaster must stay white, a little less.
 */
export async function vividHouseFrame(frame: Buffer, kind: "interior" | "plan" | "outside"): Promise<Buffer> {
  // Plans: light lift only — heavy saturation made lawn neon plastic (16/10/2026).
  // Outside: moderate; interiors: plaster stays near-white.
  const [saturation, contrast] = kind === "interior" ? [1.1, 1.04] : kind === "plan" ? [1.06, 1.04] : [1.22, 1.06];
  const s = sharp(frame)
    .modulate({ saturation })
    .linear(contrast, -(128 * (contrast - 1)));
  // A plan sharpened a little: shrunk from its render, its edges read soft.
  return (kind === "plan" ? s.sharpen({ sigma: 0.55, m1: 0.5, m2: 1.1 }) : s)
    .jpeg({ quality: 93 })
    .toBuffer();
}
