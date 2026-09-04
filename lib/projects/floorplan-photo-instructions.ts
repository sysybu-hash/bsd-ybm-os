/** הנחיות פענוח לצילום טלפון של תוכנית מודפסת (צל, רשת, כתב יד, ס"מ). */

export const FLOORPLAN_PHOTO_LAYOUT_RULES = `
Photograph of a printed sheet (phone photo, uneven light, shadow, slight blur, overlapping dimension ticks):
- Thick dark strokes are walls. Ignore the pale grey construction grid and paper texture.
- Ignore ink smears, black streaks, coffee stains, and the table/stove around the paper — they are not walls.
- The photo may be tilted or the paper buckled: reconstruct an orthogonal plan from the wall graph, do not copy perspective skew.
- Integer labels like 330, 290, 150, 1050 are centimetres (3.30 m, 2.90 m, 1.50 m, 10.50 m).
- Read handwritten Hebrew and pencil dimensions as well as printed text.
- Stairs / גרם מדרגות / מעלית: building core OUTSIDE the unit is circulation, not a living room.
- INTERNAL stairs INSIDE the apartment: extract as "מדרגות פנים" ONLY if a stair flight is drawn inside the unit, or TWO printed elevations 0.8–3.6 m apart appear. A single +9.64 on all rooms is ONE floor — do not invent +8.06 or a duplex.
- Elevation targets (±0.00, +1.26, +8.06, +9.64, −0.10) are not rooms. Copy them if printed. Do not invent a missing pair. −0.10 terrace / −0.05 building landing is not another floor.
- floor is the printed קומה word/number, never an elevation.
- Do not flatten a duplex that is actually drawn. Do not invent a duplex that is not.
- Extract ONLY the labeled apartment (e.g. דירה 1). Do not invent neighboring units from the same sheet.
- Fixture icons (bath, cooktop) identify bathroom/kitchen even if the Hebrew label is missing. A separate WC cubicle only if a toilet pan AND its own door are drawn. Do not invent an entrance sink or שירותים. A 90 cm mark is a door, not a basin.
- Do not invent extra balconies or a wraparound deck. מרפסת גג is a small service terrace if printed, not a roof over the bedrooms.
- חלון ממ"ד / thick protected walls → kind mmd, ONE protected room per unit, not a second ממ"ד and not an extra bedroom.
- 0.64 מ"ר is a tiny terrace strip, not 6.4.
- The large open space labeled דירה N is the living room (סלון), not a void. A single printed wall tick is not the living-room size.
- A curved outer wall with columns is a balcony/terrace, not a missing room.
- List only spaces that are drawn. Do not add a guest WC, extra terrace, or extra room from a remembered layout.
`.trim();

export const FLOORPLAN_PHOTO_OCR_RULES = `
This may be a phone photo of a printed sheet (uneven light, shadow, slight motion blur, overlapping ticks, ink smear).
Read printed AND handwritten Hebrew/numbers. Ignore the pale grid, ink blobs, and anything outside the paper.
Integers such as 330, 290, 150, 1050 are centimetres (3.30 m, 2.90 m, 1.50 m, 10.50 m).
Copy "דירה N" if visible. Copy elevation markers (±0.00, +1.26, +8.06, +9.64). Copy מ"ר totals (111.29). Do not invent text that is not on the page.
`.trim();
