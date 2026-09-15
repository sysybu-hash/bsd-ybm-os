import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Printed area, remembered by the file's own bytes.
 *
 * A second run of the same sheet must not pay for extraction again. The key
 * is a hash of the file, not the name — two crops of the same apartment are
 * different files.
 */

export function floorplanFileHash(bytes: Buffer | Uint8Array): string {
  return createHash("sha256").update(Buffer.from(bytes)).digest("hex");
}

export function floorplanAreaCachePath(
  hash: string,
  root = path.join(process.cwd(), ".cache", "floorplan-area"),
): string {
  return path.join(root, `${hash}.json`);
}

export function readCachedGrossAreaM2(
  bytes: Buffer | Uint8Array,
  root?: string,
): number | null {
  const file = floorplanAreaCachePath(floorplanFileHash(bytes), root);
  if (!fs.existsSync(file)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as { grossAreaM2?: unknown };
    const n = Number(raw.grossAreaM2);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function writeCachedGrossAreaM2(
  bytes: Buffer | Uint8Array,
  grossAreaM2: number,
  root?: string,
): void {
  if (!(grossAreaM2 > 0)) return;
  const file = floorplanAreaCachePath(floorplanFileHash(bytes), root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ grossAreaM2 }, null, 2));
}
