/**
 * @jest-environment node
 */
import fs from "fs";
import path from "path";

import sharp from "sharp";

require("dotenv").config({ path: ".env.local" });

import {
  locateApartmentEntrance,
  markApartmentEntrance,
} from "@/lib/projects/floorplan-entrance";
import { stampFloorplanStill } from "@/lib/projects/floorplan-viz-stamp";

const DIR = path.join(process.cwd(), "תוכניות לביצוע הדמיות");

async function withoutStampBar(src: string): Promise<Buffer> {
  const meta = await sharp(src).metadata();
  const W = meta.width!;
  const H = meta.height!;
  const barH = H - Math.round(H / 1.062);
  const strip = await sharp(src)
    .extract({ left: 0, top: H - Math.round(barH * 0.6), width: W, height: Math.round(barH * 0.5) })
    .greyscale()
    .stats();
  const dark = (strip.channels[0]?.mean ?? 255) < 70;
  return sharp(src)
    .extract({ left: 0, top: 0, width: W, height: dark ? H - barH : H })
    .jpeg({ quality: 95 })
    .toBuffer();
}

it("mark", async () => {
  const unit = process.env.UNIT!;
  const area = Number(process.env.AREA!);
  const frame = await withoutStampBar(path.join(DIR, process.env.SRC!));
  const img = { base64: frame.toString("base64"), mimeType: "image/jpeg" };
  const plan = fs.readFileSync(path.join(DIR, process.env.PLAN!));
  const point = await locateApartmentEntrance({
    base64: plan.toString("base64"),
    mimeType: "application/pdf",
  });
  console.log("point", JSON.stringify(point));
  const marked = point ? await markApartmentEntrance(img, point) : img;
  const stamped = await stampFloorplanStill(marked, { unitLabel: unit, areaM2: area });
  fs.writeFileSync(path.join(DIR, process.env.OUT!), Buffer.from(stamped.base64, "base64"));
}, 300_000);
