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



export function isMobileViewport(viewport = getViewportSize()): boolean {

  return viewport.width < MOBILE_BREAKPOINT_PX;

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
export function resolveShellDesktopDimensions(
  workspace: { width: number; height: number },
  preferredSize: { width: number; height: number },
): { width: number; height: number } {
  const fitted = computeDesktopWindowSize(workspace, preferredSize);
  const maxW = Math.max(320, workspace.width - 16);
  const maxH = Math.max(280, workspace.height - 16);
  return {
    width: Math.max(DESKTOP_MIN_WINDOW_WIDTH, Math.min(fitted.width, maxW)),
    height: Math.max(DESKTOP_MIN_WINDOW_HEIGHT, Math.min(fitted.height, maxH)),
  };
}

export const RESIZE_MIN_WINDOW_WIDTH = 360;
export const RESIZE_MIN_WINDOW_HEIGHT = 280;

export function computeDesktopWindowSize(

  workspace: { width: number; height: number },

  preferred?: { width: number; height: number },

): { width: number; height: number } {

  const maxW = Math.max(360, workspace.width - 32);

  const maxH = Math.max(320, workspace.height - 32);

  const ratioW = Math.round(workspace.width * DESKTOP_WINDOW_WIDTH_RATIO);

  const ratioH = Math.round(workspace.height * DESKTOP_WINDOW_HEIGHT_RATIO);



  let width = Math.min(maxW, Math.max(360, DESKTOP_MIN_WINDOW_WIDTH, ratioW));

  let height = Math.min(maxH, Math.max(320, DESKTOP_MIN_WINDOW_HEIGHT, ratioH));



  if (preferred) {

    width = Math.min(maxW, Math.max(width, Math.min(preferred.width, maxW)));

    height = Math.min(maxH, Math.max(height, Math.min(preferred.height, maxH)));

  }



  return { width, height };

}



export function centerWindowInWorkspace(

  workspace: { width: number; height: number },

  size: { width: number; height: number },

  stackIndex = 0,

): { x: number; y: number } {

  const offset = stackIndex * 24;

  return {

    x: Math.max(0, Math.round((workspace.width - size.width) / 2) + offset),

    y: Math.max(0, Math.round((workspace.height - size.height) / 2) + offset),

  };

}



function isDegenerateDesktopLayout(

  widget: { position: { x: number; y: number }; size: { width: number; height: number } },

  workspace: { width: number; height: number },

): boolean {

  const tooNarrow = widget.size.width < Math.min(720, workspace.width * 0.42);

  const tooShort = widget.size.height < Math.min(480, workspace.height * 0.38);

  const stuckLeft =

    widget.position.x < 48 && widget.size.width < workspace.width * 0.55;

  return tooNarrow || tooShort || stuckLeft;

}



export type WidgetLayoutSeed = {

  position: { x: number; y: number };

  size: { width: number; height: number };

  isMaximized: boolean;

};



export function buildWidgetLayout(

  _type: WidgetType,

  defaultSize: { width: number; height: number },

  stackIndex = 0,

): WidgetLayoutSeed {

  const viewport = getViewportSize();

  const workspace = getWorkspaceContentSize(viewport);



  if (workspace.mobile) {

    return {

      position: { x: 0, y: 0 },

      size: { width: workspace.width, height: workspace.height },

      isMaximized: true,

    };

  }



  const size = computeDesktopWindowSize(workspace, defaultSize);

  const position = centerWindowInWorkspace(workspace, size, stackIndex);



  return {

    position,

    size,

    isMaximized: false,

  };

}



export function normalizeWidgetForViewport<T extends {

  position: { x: number; y: number };

  size: { width: number; height: number };

  isMaximized?: boolean;

}>(widget: T): T {

  const workspace = getWorkspaceContentSize();

  if (workspace.mobile) {

    return {

      ...widget,

      position: { x: 0, y: 0 },

      size: { width: workspace.width, height: workspace.height },

      isMaximized: true,

    };

  }



  if (widget.isMaximized) return widget;



  if (!isDegenerateDesktopLayout(widget, workspace)) {

    const clampedW = Math.min(widget.size.width, workspace.width - 16);

    const clampedH = Math.min(widget.size.height, workspace.height - 16);

    const size = {

      width: Math.max(360, clampedW),

      height: Math.max(320, clampedH),

    };

    const maxX = Math.max(0, workspace.width - size.width);

    const maxY = Math.max(0, workspace.height - size.height);

    return {

      ...widget,

      size,

      position: {

        x: Math.max(0, Math.min(widget.position.x, maxX)),

        y: Math.max(0, Math.min(widget.position.y, maxY)),

      },

    };

  }



  const size = computeDesktopWindowSize(workspace, widget.size);

  const position = centerWindowInWorkspace(workspace, size);



  return {

    ...widget,

    position,

    size,

    isMaximized: false,

  };

}

