import { createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "node:fs";
const [src, dst] = process.argv.slice(2);
const im = await loadImage(fs.readFileSync(src)); const k = 1200 / Math.max(im.width, im.height);
const c = createCanvas(Math.round(im.width * k), Math.round(im.height * k)); c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
fs.writeFileSync(dst, c.toBuffer("image/jpeg"));
