#!/usr/bin/env node
/**
 * Slideshow fallback from product PNGs (not used on marketing preview by default).
 * Requires ffmpeg on PATH.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const marketingDir = path.join(root, "public", "marketing");
const concatFile = path.join(marketingDir, "hero-slideshow.ffconcat");
const outFile = path.join(marketingDir, "hero-cinematic.mp4");

const result = spawnSync(
  "ffmpeg",
  [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concatFile,
    "-vf",
    "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,format=yuv420p",
    "-r",
    "30",
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-an",
    "-t",
    "32",
    outFile,
  ],
  { cwd: marketingDir, stdio: "inherit", shell: process.platform === "win32" },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log(`Wrote ${outFile}`);
