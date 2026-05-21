import type { RefObject } from "react";
import {
  getViewportSize,
  getWorkspaceContentSize,
} from "@/lib/workspace/window-layout-policy";
import type { WorkspaceBounds } from "@/lib/workspace/screen-layout-generator";

let workspaceBoundsRef: RefObject<HTMLElement | null> | null = null;

/** נרשם מ־OSWorkspace — אזור החלונות בפועל (מתחת ל-header, מעל dock, אחרי sidebar). */
export function registerWorkspaceBoundsRef(
  ref: RefObject<HTMLElement | null> | null,
): void {
  workspaceBoundsRef = ref;
}

/** מידות אזור העבודה מה־DOM; נפילה לחישוב CSS אם אין ref. */
export function readWorkspaceBounds(): WorkspaceBounds {
  const el = workspaceBoundsRef?.current;
  if (el) {
    const width = Math.round(el.clientWidth);
    const height = Math.round(el.clientHeight);
    if (width > 0 && height > 0) {
      return { width, height };
    }
  }
  const viewport = getViewportSize();
  const workspace = getWorkspaceContentSize(viewport);
  return { width: workspace.width, height: workspace.height };
}
