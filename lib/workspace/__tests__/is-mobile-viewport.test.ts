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

  it("getViewportShortEdge returns the smaller dimension", () => {
    const viewport: WorkspaceViewport = { width: 844, height: 390 };
    expect(getViewportShortEdge(viewport)).toBe(390);
  });
});
