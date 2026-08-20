import type { WidgetType } from "@/hooks/use-window-manager";

export const MOBILE_BREAKPOINT_PX = 768;

export const DESKTOP_MIN_WINDOW_WIDTH = 900;

export const DESKTOP_MIN_WINDOW_HEIGHT = 600;

export const DESKTOP_WINDOW_WIDTH_RATIO = 0.7;

export const DESKTOP_WINDOW_HEIGHT_RATIO = 0.72;

export type WorkspaceViewport = {

  width: number;

  height: number;

};

export function getViewportSize(): WorkspaceViewport {
  if (typeof window === "undefined") {
    return { width: 1280, height: 800 };
  }

  const vv = window.visualViewport;
  const width = Math.round(vv?.width ?? window.innerWidth);
  const height = Math.round(vv?.height ?? window.innerHeight);
  return { width: Math.max(320, width), height: Math.max(400, height) };
}

/** הקצה הקצר — נשאר מובייל גם ב-landscape (למשל 844×390). */
export function getViewportShortEdge(viewport: WorkspaceViewport): number {
  return Math.min(viewport.width, viewport.height);
}

export function matchesCoarsePointer(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

export function isMobileViewport(viewport = getViewportSize()): boolean {
  const shortEdge = getViewportShortEdge(viewport);
  if (shortEdge < MOBILE_BREAKPOINT_PX) return true;
  if (typeof window !== "undefined" && matchesCoarsePointer() && shortEdge < MOBILE_BREAKPOINT_PX + 96) {
    return true;
  }
  return false;
}

/** אזור עבודה מתחת ל-header ומעל omnibar/ניווט תחתון */

export function getWorkspaceChromeInsets(viewport = getViewportSize()) {

  const mobile = isMobileViewport(viewport);

  const top = `calc(var(--workspace-header-height, 4rem) + env(safe-area-inset-top, 0px))`;

  const bottom = mobile

    ? `var(--mobile-chrome-bottom, calc(5.5rem + env(safe-area-inset-bottom, 0px)))`

    : `var(--desktop-dock-clearance, 7rem)`;

  const side = mobile ? 0 : 0;

  return { top, bottom, side, mobile };

}

function readCssPxVar(name: string, fallback: number): number {

  if (typeof window === "undefined") return fallback;

  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  if (!raw) return fallback;

  const probe = document.createElement("div");

  probe.style.position = "absolute";

  probe.style.visibility = "hidden";

  probe.style.height = raw;

  document.documentElement.appendChild(probe);

  const px = probe.offsetHeight;

  probe.remove();

  return px > 0 ? px : fallback;

}

export function getWorkspaceContentSize(viewport = getViewportSize()) {

  const mobile = isMobileViewport(viewport);

  const headerPx = readCssPxVar("--workspace-header-height", mobile ? 64 : 64);

  const bottomPx = mobile

    ? readCssPxVar("--mobile-chrome-bottom", 88)

    : readCssPxVar("--desktop-dock-clearance", 112);

  const safeTop =

    typeof window !== "undefined"

      ? parseInt(

          getComputedStyle(document.documentElement).getPropertyValue("--safe-top") || "0",

          10,

        ) || 0

      : 0;

  const sidePad = mobile ? 0 : 24;

  const width = Math.max(280, viewport.width - sidePad);

  const height = Math.max(320, viewport.height - headerPx - bottomPx - safeTop);

  return { width, height, mobile };

}

/** גודל חלון לתצוגה ב-Shell — לא לכווץ מתחת למדיניות שולחן העבודה */
