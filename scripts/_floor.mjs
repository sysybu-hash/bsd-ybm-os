/** The scanline floor mask, drawn over the plan at the same scale. */
import fs from "node:fs";
import sharp from "sharp";
const { extractFloorplanVectorGeometry, wallBoundingBox } = await import("../lib/projects/floorplan-vector.ts");
const { hatchedWallExtent, bodyRect } = await import("../lib/projects/floorplan-solid.ts");
const { buildFlatFromPdf } = await import("../lib/projects/floorplan-build.ts");
const SP = process.argv[2], tag = process.argv[3] ?? "floor";
const dir = "תוכניות לביצוע הדמיות";
const g = await extractFloorplanVectorGeometry(Buffer.from(fs.readFileSync(`${dir}/דירה 14 .pdf`)));
const extent = hatchedWallExtent(g.segments, wallBoundingBox(g), 54);
const b = await buildFlatFromPdf(Buffer.from(fs.readFileSync(`${dir}/דירה 14 מקור.pdf`)), 111.29, { extent });
console.log("extent", JSON.stringify(extent), "bounds", JSON.stringify(b.bounds));
const S = 2, X0 = extent.x, Y0 = extent.y;
const W = Math.ceil(extent.width * S), H = Math.ceil(extent.height * S);
const rgb = Buffer.alloc(W * H * 3, 255);
const rows = b.floor;
const rh = rows.length > 1 ? rows[1].y - rows[0].y : 1;
for (const r of rows) {
  for (let y = Math.round((r.y - Y0) * S); y < (r.y + rh - Y0) * S; y++) {
    if (y < 0 || y >= H) continue;
    for (const [a, c] of r.spans)
      for (let x = Math.round((a - X0) * S); x <= (c - X0) * S; x++)
        if (x >= 0 && x < W) { const i = (y*W+x)*3; rgb[i]=250; rgb[i+1]=215; rgb[i+2]=150; }
  }
}
for (const bd of b.bodies) {
  const r = bodyRect(bd);
  for (let y = Math.round((r.y-Y0)*S); y < (r.y-Y0+r.h)*S; y++)
    for (let x = Math.round((r.x-X0)*S); x < (r.x-X0+r.w)*S; x++)
      if (x>=0&&y>=0&&x<W&&y<H) { const i=(y*W+x)*3; rgb[i]=40; rgb[i+1]=40; rgb[i+2]=40; }
}
await sharp(rgb, { raw: { width: W, height: H, channels: 3 } }).png().toFile(`${SP}/${tag}-raw.png`);
const HH = 1500;
const [A,B] = await Promise.all([
  sharp(`${SP}/plan-crop.jpg`).resize({height:HH}).toBuffer({resolveWithObject:true}),
  sharp(`${SP}/${tag}-raw.png`).resize({height:HH}).flatten({background:"#fff"}).toBuffer({resolveWithObject:true}),
]);
await sharp({create:{width:A.info.width+B.info.width+30,height:HH,channels:3,background:"#ffffff"}})
  .composite([{input:A.data,left:0,top:0},{input:B.data,left:A.info.width+30,top:0}])
  .jpeg({quality:92}).toFile(`${SP}/${tag}.jpg`);
console.log("floor m2", b.floorM2.toFixed(1), "wrote", tag);
