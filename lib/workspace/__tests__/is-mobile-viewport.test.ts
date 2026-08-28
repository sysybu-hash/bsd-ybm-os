/** @jest-environment jsdom */

import {
  getViewportShortEdge,
  isMobileViewport,
  type WorkspaceViewport,
} from "@/lib/workspace/window-layout-policy";

describe("isMobileViewport", () => {
  it("treats portrait phone as mobile", () => {
    expect(isMobileViewport({ width: 390, height: 844 })).toBe(true);
  });

  it("treats landscape phone as mobile (short edge)", () => {
    expect(isMobileViewport({ width: 844, height: 390 })).toBe(true);
  });

  it("treats wide desktop as non-mobile", () => {
    expect(isMobileViewport({ width: 1440, height: 900 })).toBe(false);
  });

  it("treats iPad landscape as non-mobile when short edge is 768", () => {
    expect(isMobileViewport({ width: 1024, height: 768 })).toBe(false);
  });

  /**
   * The case that sent every desktop E2E run through the mobile shell: 1280x720
   * is Playwright's Desktop Chrome and a very ordinary laptop, and its short
   * edge (720) sits below the 768 breakpoint exactly like a phone held
   * sideways. Short edge alone cannot tell those apart.
   */
  it("treats a 1280x720 laptop as desktop", () => {
    expect(isMobileViewport({ width: 1280, height: 720 })).toBe(false);
  });

  it("treats 1366x768 as desktop", () => {
    expect(isMobileViewport({ width: 1366, height: 768 })).toBe(false);
  });

  /**
   * Height, not short edge, is the honest test for a fine-pointer window: the
   * desktop shell cannot lay itself out below DESKTOP_MIN_WINDOW_HEIGHT, so a
   * short browser window still belongs in the mobile layout.
   */
  it("treats a browser window too short for the desktop shell as mobile", () => {
    expect(isMobileViewport({ width: 1200, height: 500 })).toBe(true);
  });

  it("treats a narrow-but-tall window as mobile", () => {
    expect(isMobileViewport({ width: 700, height: 1200 })).toBe(true);
  });

  it("getViewportShortEdge returns the smaller dimension", () => {
    const viewport: WorkspaceViewport = { width: 844, height: 390 };
    expect(getViewportShortEdge(viewport)).toBe(390);
  });
});
