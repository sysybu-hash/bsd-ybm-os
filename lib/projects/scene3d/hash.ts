import type { FlatScene, SceneBox } from "@/lib/projects/scene3d/types";

/**
 * A short, stable string for a whole scene.
 *
 * The cheap determinism gate: one line per reference plan in a snapshot test
 * catches any accidental change to a standard, a rule or a mesh, for ever. It
 * is not a checksum of bytes — it is a checksum of the building, rounded to a
 * tenth of a millimetre so that floating-point noise between machines cannot
 * make a passing test fail.
 */

const PLACES = 4;

function n(value: number): string {
  // -0 and 0 are the same place in a flat.
  const rounded = Number(value.toFixed(PLACES));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function meshKey(mesh: SceneBox): string {
  return [
    mesh.kind,
    mesh.material,
    mesh.sourceId,
    n(mesh.centre.x),
    n(mesh.centre.y),
    n(mesh.centre.z),
    n(mesh.size.x),
    n(mesh.size.y),
    n(mesh.size.z),
  ].join("|");
}

/** FNV-1a, 32 bits, hex — short enough to read in a test failure. */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function hashScene(scene: FlatScene): string {
  const parts = [
    `v${scene.version}`,
    `upm:${n(scene.unitsPerMetre)}`,
    `extent:${n(scene.extent.x)},${n(scene.extent.z)},${n(scene.extent.width)},${n(scene.extent.depth)}`,
    ...scene.meshes.map(meshKey).sort(),
    ...scene.rooms.map((room) => `room:${room.kind}:${room.name}:${n(room.areaM2)}`).sort(),
    ...scene.openings
      .map((o) => `opening:${o.kind}:${n(o.centre.x)},${n(o.centre.z)}:${n(o.sillM)}-${n(o.headM)}`)
      .sort(),
  ];
  return `${fnv1a(parts.join("\n"))}-${scene.meshes.length}`;
}
