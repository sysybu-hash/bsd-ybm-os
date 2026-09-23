import * as pieces from "@/lib/projects/scene3d/furniture/pieces";
import { rotatePart, type PiecePart, type PieceSpec } from "@/lib/projects/scene3d/furniture/types";

/**
 * The measured block, built as the thing it was measured to be.
 *
 * One entry per FurnitureKind the measurement can produce. A kind with no
 * entry falls to `unknown`, which is a plain box — never a guess at which
 * specific object it might have been.
 */

const BUILDERS: Record<string, (spec: PieceSpec) => PiecePart[]> = {
  bed: pieces.bed,
  desk: pieces.desk,
  table: pieces.table,
  seat: pieces.seat,
  storage: pieces.storage,
  counter: pieces.counter,
  hob: pieces.hob,
  sink: pieces.sink,
  fixture: pieces.fixture,
  unknown: pieces.unknown,
};

export function partsFor(kind: string, spec: PieceSpec): PiecePart[] {
  const build = BUILDERS[kind] ?? pieces.unknown;
  return build(spec).map((p) => rotatePart(p, spec.facing));
}

export { fixtureKind } from "@/lib/projects/scene3d/furniture/fixture-kind";
export type { PiecePart, PieceSpec } from "@/lib/projects/scene3d/furniture/types";
