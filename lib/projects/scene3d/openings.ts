import {
  DOOR_HEAD_M,
  WINDOW_HEAD_M,
  WINDOW_SILL_M,
  WINDOW_SILL_WET_M,
} from "@/lib/projects/scene3d/standards";
import type { SceneOpeningKind } from "@/lib/projects/scene3d/types";

/**
 * What an opening is, in three dimensions.
 *
 * The kind — door, window, cased opening — is measured: a drawn swing is a
 * door, a gap in an outer wall is a window, a gap in an inner wall is neither.
 * The heights are standards, the same in every flat. The one derived case is
 * the terrace slider: an exterior opening wide enough to walk through, giving
 * onto a measured terrace, reaches the floor because that is what it is.
 */
export function openingHeights(
  kind: SceneOpeningKind,
  wet: boolean,
): { sillM: number; headM: number } {
  if (kind === "door" || kind === "opening" || kind === "slider") {
    return { sillM: 0, headM: kind === "slider" ? WINDOW_HEAD_M : DOOR_HEAD_M };
  }
  return { sillM: wet ? WINDOW_SILL_WET_M : WINDOW_SILL_M, headM: WINDOW_HEAD_M };
}
