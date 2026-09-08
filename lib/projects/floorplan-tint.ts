import sharp from "sharp";

/**
 * How much of a finished still is still wearing a coding colour.
 *
 * The geometry render tints each block roughly the material it becomes, and the
 * sanitary blocks have to be a cool aqua to be separable from bed linen at all —
 * at two parts in 255 apart the beds came back as bathtubs. A second pass takes
 * that tint out again, and usually does. When it does not, the bath, the basins
 * and the whole bathroom floor come out mint, which is unusable.
 *
 * The auditor cannot see this: it counts rooms, beds and fixtures, and a mint
 * bathroom has the right number of everything. One frame scored 0 with both
 * bathrooms bright green. The finished palette is warm — oak, white plaster,
 * white ceramic, pale stone — so a saturated cyan-to-violet cast is not a thing
 * the render is ever supposed to contain, and measuring it needs no model.
 */
export async function coolTintFraction(
  image: { base64: string } | Buffer,
): Promise<number> {
  const buffer = Buffer.isBuffer(image)
    ? image
    : Buffer.from(image.base64, "base64");
  const { data, info } = await sharp(buffer)
    .resize(200, 200, { fit: "inside" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let tinted = 0;
  const pixels = info.width * info.height;
  for (let i = 0; i < pixels; i++) {
    const r = data[i * 3]! / 255;
    const g = data[i * 3 + 1]! / 255;
    const b = data[i * 3 + 2]! / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    // Dark pixels carry unreliable hue, and a shadow on white plaster is
    // faintly blue; neither is a coding colour. The floor was 0.2 and read a
    // bright mint bathroom as clean, because the residue is pale rather than
    // vivid. Swept on one frame of each kind: at 0.08 the mint still measures
    // 31.0% and the correct one 0.00%, and the gap only closes below 0.06.
    if (max < 0.3 || delta / max < 0.08) continue;
    let hue: number;
    if (max === r) hue = 60 * (((g - b) / delta) % 6);
    else if (max === g) hue = 60 * ((b - r) / delta + 2);
    else hue = 60 * ((r - g) / delta + 4);
    if (hue < 0) hue += 360;
    // Cyan through violet. Oak, plaster, stone and white ceramic all sit in the
    // warm half of the wheel, so nothing in a correct finish lands here.
    if (hue >= 140 && hue <= 280) tinted++;
  }
  return tinted / pixels;
}

/**
 * Above this, a coding colour survived into the finish.
 *
 * Was 2%, set well clear of both sides of the sweep — a bad frame measured 31%
 * and a good one 0%. Too generous in the middle: a frame with a turquoise
 * bathroom floor and a magenta panel down one wall measures 1.61% and passed,
 * scoring 0 overall, because the residue is confined to a couple of surfaces
 * rather than washed over everything. In a booklet a client is paying for, any
 * visible coding colour is a reject, and 0.5% still clears a correct frame by an
 * order of magnitude.
 */
export const TINT_LIMIT = 0.005;
