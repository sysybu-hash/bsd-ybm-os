import type {} from "@/hooks/use-window-manager";

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

/**
 * Short edge alone cannot separate a phone held sideways (844x390) from an
 * ordinary laptop (1280x720): both fall under the 768 breakpoint. Keying on it
 * put the full-screen mobile shell on every 720p desktop — including
 * Playwright's Desktop Chrome, which is why the desktop E2E suite had been
 * exercising the mobile layout without anyone noticing.
 *
 * Three questions, in order, each answerable on its own terms:
 */
export function isMobileViewport(viewport = getViewportSize()): boolean {
  const shortEdge = getViewportShortEdge(viewport);

  // 1. Too narrow for the desktop layout to go anywhere, whatever the device.
  if (viewport.width < MOBILE_BREAKPOINT_PX) return true;

  // 2. Wide but short *and* touch-driven: a phone or tablet in landscape.
  //    The pointer is what distinguishes it from the laptop above.
  if (typeof window !== "undefined" && matchesCoarsePointer() && shortEdge < MOBILE_BREAKPOINT_PX + 96) {
    return true;
  }

  // 3. Too short for the desktop shell to lay a window out at all. Tying this
  //    to the shell's own minimum keeps the two from drifting apart.
  if (viewport.height < DESKTOP_MIN_WINDOW_HEIGHT) return true;

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
