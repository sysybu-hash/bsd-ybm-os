/**
 * How tall each kind of piece stands, in metres.
 *
 * Shared with the deterministic 3D engine (lib/projects/scene3d): the oblique
 * plate and the render must agree, or a plate that passes its fidelity check
 * describes a flat the render does not draw. One table, imported by both.
 *
 * It lives in a module of its own, with no imports, because the 3D scene is
 * built in the browser too — and importing it from the SVG painter dragged
 * that painter's sharp and pdfjs dependencies into the client bundle, where
 * the build refused them.
 */
export const FURNITURE_HEIGHTS_M: Record<string, number> = {
  bed: 0.5,
  desk: 0.74,
  storage: 2.0,
  counter: 0.9,
  fixture: 0.55,
  hob: 0.92,
  sink: 0.9,
  table: 0.75,
  // A seat, not a seat back. At 0.85 a chair stood as tall as a worktop at
  // 0.9, and the model read the blocks as what they matched: the island's
  // four stools came out as a length of counter and the living-room suite as
  // a wall. Half a metre is what you sit on, and nothing else in the flat is
  // that low.
  seat: 0.45,
  unknown: 0.5,
};
