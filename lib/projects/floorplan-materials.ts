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

/**
 * What each colour in the deterministic render stands for.
 *
 * Rendered in one neutral tone the model read five bed blocks and drew two
 * beds, and turned a block standing on the service terrace into a bathroom. The
 * kind is known from the geometry, so it is stated rather than left to be
 * inferred from proportions.
 */
export const FURNITURE_KEY_PROMPT = `The raised coloured blocks standing on the floor are furniture, already positioned exactly as the architect drew them. The colour states what each block is:
- BLUE block = a SINGLE bed. One mattress, one pillow, its own headboard against the nearest wall. Never a double bed. Exactly as many beds as blue blocks.
- YELLOW/SAND block = a fitted wardrobe or a kitchen run, doors closed.
- PURPLE block = a kitchen counter or island.
- GREEN block = a sanitary fixture: a bath if it is long, a toilet or washbasin if it is small. Only ever a fixture, and only inside the room it stands in.
- GREY-BEIGE block = a small side piece, such as a bedside table.

Render every block, without exception. Do not add furniture where there is no block. Do not move, resize, merge or remove a block. Do not turn a terrace into a room: a paved outdoor area stays an open terrace with a railing whatever stands on it. Every screen, television and dark rectangular panel is forbidden anywhere in the frame.`;

/**
 * The second pass, which takes the key back out.
 *
 * Asking for the colours to "disappear into the real material" in the placement
 * pass does not work — the model treats the key as a palette and returns blue
 * bedding and a purple counter. Asked to place, it places well; asked separately
 * to restate those objects in real materials and change nothing else, it does
 * that well too. Two narrow passes beat one that has to do both.
 */
export const RECOLOUR_PROMPT = `This is a finished top-down render of one apartment. Every wall, room, opening and piece of furniture is already exactly right and must not be changed in any way.

One thing is wrong: some objects are still in the flat coding colours used to build the image. Restate those objects in their real materials, and change NOTHING else — same walls, same outline, same orientation, same furniture, same positions, same sizes, same camera.
- Anything blue is a bed: white linen bedding, pale oak frame and headboard. A single bed, never a double.
- Anything yellow or sand-coloured is a wardrobe or kitchen unit: warm pale oak, doors closed.
- Anything purple is a kitchen counter: white stone worktop over oak base units.
- Anything mint-green is a sanitary fixture: white glazed ceramic.
- Any coloured floor becomes its proper surface: warm oak boards in the rooms, pale stone tiles in the wet rooms and on the terraces.

When you are done, no blue, purple or mint-green object may remain anywhere in the frame. Keep the warm golden-hour daylight. No text, no labels, no screens, no televisions.`;

/** The placement pass: materials rules plus the furniture key. */
export function buildPlacementPrompt(extraDirection?: string): string {
  // The blanket "No furniture" belongs to the empty-shell pass and would
  // contradict the key.
  const base = MATERIALS_ONLY_PROMPT.replace("- No furniture. ", "- ");
  const parts = [base, FURNITURE_KEY_PROMPT];
  const extra = extraDirection?.trim();
  if (extra) {
    parts.push(
      `Additional direction for the materials only — it does not license any change to the geometry above:
${extra}`,
    );
  }
  return parts.join("\n\n");
}
