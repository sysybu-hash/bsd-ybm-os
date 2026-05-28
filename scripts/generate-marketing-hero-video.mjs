#!/usr/bin/env node
/**
 * Downloads a live stock clip (Pexels, business/tech) and builds hero-cinematic.mp4.
 * Requires curl (or curl.exe on Windows) and ffmpeg on PATH.
 *
 * License: Pexels License — free for commercial use (https://www.pexels.com/license/).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const marketingDir = path.join(root, "public", "marketing");
const sourceFile = path.join(marketingDir, "_hero-source.mp4");
const outFile = path.join(marketingDir, "hero-cinematic.mp4");

/** Hands typing on laptop — office / software workflow (Pexels #3129671). */
const PEXELS_MP4 =
  "https://videos.pexels.com/video-files/3129671/3129671-hd_1920_1080_30fps.mp4";

const curlBin = process.platform === "win32" ? "curl.exe" : "curl";

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...opts,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
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

console.log("Encoding 20s loop (1920×1080)…");
run("ffmpeg", [
  "-y",
  "-i",
  sourceFile,
  "-t",
  "20",
  "-vf",
  "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,format=yuv420p",
  "-c:v",
  "libx264",
  "-preset",
  "fast",
  "-crf",
  "24",
  "-pix_fmt",
  "yuv420p",
  "-movflags",
  "+faststart",
  "-an",
  outFile,
]);

fs.unlinkSync(sourceFile);
console.log(`Wrote ${outFile}`);
