/**
 * Materials and light over geometry that is already correct.
 *
 * The pipeline spent this project asking an image model to draw a flat from its
 * plan, and it cannot: it samples, so five runs and five repair passes on
 * דירה 14 still produced invented rooms, invented openings, and the whole floor
 * plate mirrored or turned. What it is good at is surfaces.
 *
 * So the division of labour is now absolute. Walls, thicknesses, openings and
 * the outline come from the CAD and are rendered deterministically. The model
 * receives that render and is asked for one thing: what the materials look like.
 * It never sees the sales sheet and is never asked where anything goes.
 *
 * Measured on דירה 14 against the plan: footprintMatchesPlan true,
 * rotationVsPlanDegrees 0, mirroredVsPlan false, roomsOutsidePlanOutline 0,
 * openingsNotInPlan 0 — every geometric check that had never passed together.
 */

export const MATERIALS_ONLY_PROMPT = `This image is an EXACT architectural render of one apartment, generated from CAD geometry. Every wall, every wall thickness, every doorway gap and the outline of the flat are already correct and must NOT be changed.

Your only task is to apply realistic materials and lighting to this exact geometry, as a finished Israeli sales-brochure top-down still:
- Keep every wall exactly where it is, at exactly its drawn thickness and length. Do not add, remove, move, lengthen, shorten, straighten or merge any wall.
- Keep the outline of the flat exactly as it is, including every step and notch in it.
- Keep every gap in a wall exactly where it is — those are the doorways.
- Do not rotate, mirror or reflect the image. The result must overlay the input exactly.
- Do not add any room, balcony, wing or open space that is not already outlined here.
- Materials only: warm oak plank flooring inside the rooms, pale stone tiling in the wet rooms and on the terraces, clean white-plaster wall tops and inner faces, soft warm golden-hour daylight raking across the floor with gentle shadows cast by the walls.
- No furniture. No text, numbers or labels anywhere. No people.

Return the same apartment, same shape, same position, same orientation — only rendered in real materials and light.`;

/**
 * The instruction for one materials pass.
 *
 * Extra wishes are appended rather than woven in, so the geometry clauses above
 * always read first and whole. A caller asking for a warmer palette must not be
 * able to dislodge "do not move any wall" by phrasing.
 */
export function buildMaterialsPrompt(extraDirection?: string): string {
  const extra = extraDirection?.trim();
  if (!extra) return MATERIALS_ONLY_PROMPT;
  return `${MATERIALS_ONLY_PROMPT}

Additional direction for the materials only — it does not license any change to the geometry above:
${extra}`;
}
