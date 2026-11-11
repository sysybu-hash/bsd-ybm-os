// Scratch: each elevation render beside the architect's sheet it answers to (paired by geometry, not by the view's name).
import path from "node:path";
import sharp from "sharp";
const [R, S] = [process.argv[2]!, process.argv[3]!];
const pairs: Array<[string, string, string]> = [["elev-east.jpg", "elev-east.png", "חזית מזרחית"], ["elev-south.jpg", "elev-north.png", "חזית צפונית"], ["elev-west.jpg", "elev-west.png", "חזית מערבית"], ["elev-north.jpg", "elev-south.png", "חזית דרומית"]];
for (const [r, s, name] of pairs) {
  const H = 1100;
  const a = await sharp(path.join(R, r)).resize({ height: H }).toBuffer();
  const b = await sharp(path.join(S, s)).resize({ height: H }).toBuffer();
  const [ma, mb] = [await sharp(a).metadata(), await sharp(b).metadata()];
  await sharp({ create: { width: ma.width! + mb.width! + 20, height: H, channels: 3, background: "#ffffff" } })
    .composite([{ input: a, left: 0, top: 0 }, { input: b, left: ma.width! + 20, top: 0 }])
    .jpeg({ quality: 88 }).toFile(path.join(R, `compare-${s.replace(".png", "")}.jpg`));
  console.log("compare", name);
}
