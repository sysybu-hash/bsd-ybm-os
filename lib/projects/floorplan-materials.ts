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
export const FURNITURE_KEY_PROMPT = `The raised blocks standing on the floor are furniture, already positioned exactly as the architect drew them. Each block is already tinted roughly the material it is meant to become — your job is to make it look like the real object at exactly that footprint, not to recolour it:
- A flat GREY-BROWN strip lying in a break in a wall is a DOORWAY, drawn where the architect drew it. Render an opening there — a door or a cased opening. Every doorway in this flat is already marked this way, so cut no others: where a wall runs unbroken it is solid, however closed-in the room looks.
- OFF-WHITE block, long and narrow, with a WHITE BAND across one end = a SINGLE bed, 90 cm wide and 200 cm long. The band is the pillow and marks the head. White linen, ONE pillow, pale oak frame, headboard against the nearest wall.
  The bed is exactly as wide as its block and no wider. A bed wide enough for two people, or carrying two pillows, is a failed result: this is a haredi client and one double bed makes the whole still unusable. Do not widen a bed to suit the room it stands in — a single bed in a large bedroom is correct, and is what the architect drew. Never merge a bed with the block beside it. Exactly as many beds as blocks of this kind.
  Two bed blocks standing in ONE room are two separate single beds, and both must be drawn, with the floor showing between them. This is the case the render keeps losing: given three blocks in two rooms it draws two beds and leaves a room with one, and a children's room with two singles is the commonest room in these flats. Count the blocks in each room before you draw it.
- TAN OAK block, 35-60 cm deep against a wall = a fitted wardrobe or a kitchen run, doors closed.
- PALE STONE block, wide = a kitchen counter or island: stone worktop over oak base units.
- PALE AQUA block = a sanitary fixture. The aqua is a coding tint and not the finished colour: render it as WHITE glazed ceramic, and let no aqua, mint or blue object remain anywhere in the finished frame. It is a bath if it is long, a toilet or washbasin if it is small. Only ever a fixture, and only inside the room it stands in. Aqua is the ONLY fixture colour: a bath, a toilet, a shower and a basin appear where an aqua block stands and nowhere else on this sheet. An off-white block is never one of them, however long it is and whatever room it stands in — a long off-white block with a pillow band across one end is a bed, and rendering it as a bath puts a bathroom in a bedroom.
- DARK STEEL block, a 60 cm square = the HOB. Render a four-burner cooktop set into the worktop. It is a cooktop, never a toilet or a basin, and the room it stands in is the kitchen.
- GREY STEEL block, half as wide as it is deep = a kitchen sink BASIN. There are two of them side by side and they make one double-bowl sink in a single counter cut-out — two basins, not one.
- DARK OAK block = a dining table. Set chairs around it, tucked to its edges, as many as its length takes — the sheet draws the chairs as curved symbols this render does not carry, so they are expected here. Chairs go around the table and nowhere else. There is one dining table per flat.
- GREY-BEIGE block = a small side piece: a bedside table beside a bed, an armchair in a living space.

A bath, a toilet, a shower or a washbasin appears ONLY where a pale aqua fixture block stands. A room containing no aqua block is not a bathroom, whatever its shape: render it with the furniture its own blocks carry and an ordinary floor. Wardrobes are not fixtures — a room whose blocks are tan oak is a bedroom or a store, never a wet room. There are exactly as many wet rooms as there are groups of aqua blocks.

- A PALE STONE-GREY area enclosed by a thin grey outline, cooler than the oak floor around it, is a TERRACE: an open outdoor area, paved in stone, with a railing or parapet along the outline and open sky above. Never roof it, never floor it in oak, and never wall it in — it is outside the apartment, and it is one of the things the flat is being sold on.

Render every block, without exception. Do not add furniture where there is no block, apart from the chairs around the dining table. Do not move, resize, merge or remove a block. Do not turn a terrace into a room: a paved outdoor area stays an open terrace with a railing whatever stands on it. Every screen, television and dark rectangular panel is forbidden anywhere in the frame. The finished palette is warm and natural — oak, white plaster, white ceramic, pale stone — under golden-hour daylight, and no object may come out in a saturated colour.`;

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
- Anything blue is a bed: white linen bedding, pale oak frame and headboard. A SINGLE bed — its length must stay more than twice its width, exactly as the block is drawn. Never widen a bed, and never merge a bed with the block beside it.
- Anything yellow or sand-coloured is a wardrobe or kitchen unit: warm pale oak, doors closed.
- Anything purple is a kitchen counter: white stone worktop over oak base units.
- Anything mint-green is a sanitary fixture: white glazed ceramic.
- Anything orange is a dining table: solid oak top on oak legs.
- Anything light-green is a chair: pale upholstery on an oak frame.
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
