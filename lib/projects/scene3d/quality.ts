/**
 * How hard a renderer is allowed to work.
 *
 * Measured on the platform: a 4000 by 3000 frame with a 2048 shadow map draws
 * in about 200 ms inside a Vercel function, and the whole cost of the request
 * is reading the frame back. So the profiles differ less in what they draw
 * than in how large they draw it and how they get it out.
 */

export type QualityProfile = {
  id: "preview" | "booklet" | "gpu";
  /** The width the frame is rendered at, before downsampling. */
  renderWidthPx: number;
  /** The width the image is delivered at. */
  outputWidthPx: number;
  shadows: boolean;
  shadowMapSize: number;
  /**
   * Physical glass, which needs a scene render target per pane.
   *
   * The single most expensive thing to hand a software rasteriser, and worth
   * nothing at a bird's-eye distance — so it waits for a GPU.
   */
  transmission: boolean;
};

export const QUALITY: Record<QualityProfile["id"], QualityProfile> = {
  // The viewer in the app, where the user's own GPU draws every frame.
  preview: {
    id: "preview",
    renderWidthPx: 1600,
    outputWidthPx: 1600,
    shadows: true,
    shadowMapSize: 1024,
    transmission: false,
  },
  // The still that goes in the booklet: drawn at twice the delivered width and
  // downsampled, which is deterministic antialiasing and costs nothing here.
  booklet: {
    id: "booklet",
    renderWidthPx: 4000,
    outputWidthPx: 2000,
    shadows: true,
    shadowMapSize: 2048,
    transmission: false,
  },
  gpu: {
    id: "gpu",
    renderWidthPx: 4000,
    outputWidthPx: 2000,
    shadows: true,
    shadowMapSize: 4096,
    transmission: true,
  },
};

/** The next profile down, for when a render runs out of time. */
export function degrade(profile: QualityProfile): QualityProfile | null {
  if (profile.renderWidthPx > profile.outputWidthPx) {
    return { ...profile, renderWidthPx: profile.outputWidthPx };
  }
  if (profile.shadows) return { ...profile, shadows: false };
  return null;
}
