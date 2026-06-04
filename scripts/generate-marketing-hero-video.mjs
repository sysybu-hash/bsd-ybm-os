#!/usr/bin/env node
/**
 * Pexels stock → hero MP4/WebM + poster WebP/JPG (יעדי גודל ל-PageSpeed).
 * Requires curl + ffmpeg on PATH.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const marketingDir = path.join(root, "public", "marketing");
const sourceFile = path.join(marketingDir, "_hero-source.mp4");
const outFile = path.join(marketingDir, "hero-cinematic.mp4");

const PEXELS_MP4 =
  "https://videos.pexels.com/video-files/3129671/3129671-hd_1920_1080_30fps.mp4";

const curlBin = process.platform === "win32" ? "curl.exe" : "curl";

function run(cmd, args, options = {}) {
  const shell = options.shell ?? (cmd === curlBin && process.platform === "win32");
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    shell,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

/** קצב מקסימלי ל-x264 — חייב מחרוזת אחת (למשל `480k`), לא `480` + `k` נפרד. */
function maxRateForTarget(targetKb) {
  const kbps = Math.max(280, Math.floor((targetKb * 8) / 20));
  return `${kbps}k`;
}

function bufSizeForTarget(targetKb) {
  const kbps = Math.max(560, Math.floor((targetKb * 16) / 20));
  return `${kbps}k`;
}

function fileKb(filePath) {
  return (fs.statSync(filePath).size / 1024).toFixed(1);
}

/** x264 עם CRF עולה עד שמגיעים מתחת ליעד KB (בקירוב). */
function encodeMp4Capped(input, output, vf, targetKb, startCrf = 28) {
  for (let crf = startCrf; crf <= 36; crf += 2) {
    run("ffmpeg", [
      "-y",
      "-i",
      input,
      "-t",
      "20",
      "-vf",
      vf,
      "-c:v",
      "libx264",
      "-preset",
      "slow",
      "-crf",
      String(crf),
      "-maxrate",
      maxRateForTarget(targetKb),
      "-bufsize",
      bufSizeForTarget(targetKb),
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-an",
      output,
    ]);
    const kb = fs.statSync(output).size / 1024;
    console.log(`  crf=${crf} → ${kb.toFixed(1)} KB (target ≤${targetKb} KB)`);
    if (kb <= targetKb * 1.05) return;
  }
}

function encodeWebmIfSmaller(input, output, targetKb) {
  run("ffmpeg", [
    "-y",
    "-i",
    input,
    "-c:v",
    "libvpx-vp9",
    "-crf",
    "38",
    "-b:v",
    "0",
    "-an",
    output,
  ]);
  const webmKb = fs.statSync(output).size / 1024;
  const mp4Kb = fs.statSync(input).size / 1024;
  if (webmKb > mp4Kb || webmKb > targetKb * 1.2) {
    console.log(`  WebM ${webmKb.toFixed(1)} KB not smaller than MP4 — removing ${path.basename(output)}`);
    fs.unlinkSync(output);
    return false;
  }
  return true;
}

console.log("Downloading live hero clip from Pexels…");
run(curlBin, [
  "-fsSL",
  "-A",
  "Mozilla/5.0",
  "-e",
  "https://www.pexels.com/",
  "-o",
  sourceFile,
  PEXELS_MP4,
]);

console.log("Encoding desktop MP4 (1080p, target ≤1200 KB)…");
encodeMp4Capped(
  sourceFile,
  outFile,
  "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,format=yuv420p",
  1200,
  27,
);

const mobileFile = path.join(marketingDir, "hero-cinematic-mobile.mp4");
const desktopWebm = path.join(marketingDir, "hero-cinematic.webm");
const mobileWebm = path.join(marketingDir, "hero-cinematic-mobile.webm");
const posterJpg = path.join(marketingDir, "hero-cinematic-poster.jpg");
const posterWebp = path.join(marketingDir, "hero-cinematic-poster.webp");

console.log("Encoding mobile MP4 (720p, target ≤400 KB)…");
encodeMp4Capped(
  outFile,
  mobileFile,
  "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,format=yuv420p",
  400,
  30,
);

console.log("Encoding WebM (optional if smaller)…");
encodeWebmIfSmaller(outFile, desktopWebm, 1200);
encodeWebmIfSmaller(mobileFile, mobileWebm, 400);

console.log("Poster JPG + WebP (target ≤40 KB WebP)…");
run("ffmpeg", [
  "-y",
  "-i",
  outFile,
  "-ss",
  "00:00:02",
  "-frames:v",
  "1",
  "-vf",
  "scale=960:-2",
  "-update",
  "1",
  "-q:v",
  "8",
  posterJpg,
]);

for (const q of [72, 64, 52, 42]) {
  run("ffmpeg", [
    "-y",
    "-i",
    posterJpg,
    "-c:v",
    "libwebp",
    "-quality",
    String(q),
    posterWebp,
  ]);
  const kb = fs.statSync(posterWebp).size / 1024;
  console.log(`  webp quality=${q} → ${kb.toFixed(1)} KB`);
  if (kb <= 42) break;
}

fs.unlinkSync(sourceFile);

for (const f of [outFile, mobileFile, posterJpg, posterWebp]) {
  if (fs.existsSync(f)) console.log(`Wrote ${path.basename(f)} (${fileKb(f)} KB)`);
}
for (const f of [desktopWebm, mobileWebm]) {
  if (fs.existsSync(f)) console.log(`Wrote ${path.basename(f)} (${fileKb(f)} KB)`);
}
