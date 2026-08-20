/** @jest-environment jsdom */

import { computeProfessionalLayout } from "@/lib/workspace/screen-layout-generator";
import {
  clampWidgetLayoutToWorkspace,
  normalizeWidgetForViewport,
} from "@/lib/workspace/window-layout-policy";

describe("clampWidgetLayoutToWorkspace", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", { value: 1440, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 900, configurable: true });
    document.documentElement.style.setProperty("--workspace-header-height", "64px");
    document.documentElement.style.setProperty("--desktop-dock-clearance", "112px");
  });

  it("preserves professional grid tile position on restore", () => {
    const bounds = { width: 1200, height: 800 };
    const ids = ["a", "b", "c", "d"].map((id) => ({ id }));
    const layouts = computeProfessionalLayout(ids, bounds);
    const first = layouts.get("a");
    expect(first).toBeDefined();

    const restored = clampWidgetLayoutToWorkspace({
      position: first!.position,
      size: first!.size,
      isMaximized: false,
    });

    expect(restored.position.x).toBe(first!.position.x);
    expect(restored.position.y).toBe(first!.position.y);
    expect(restored.size.width).toBe(first!.size.width);
    expect(restored.size.height).toBe(first!.size.height);
  });

  it("normalizeWidgetForViewport recenters left-column grid tiles (legacy behavior)", () => {
    const bounds = { width: 1200, height: 800 };
    const layouts = computeProfessionalLayout(
      [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
      bounds,
    );
    const cell = layouts.get("a");
    expect(cell).toBeDefined();

    const normalized = normalizeWidgetForViewport({
      position: cell!.position,
      size: cell!.size,
      isMaximized: false,
    });

    expect(normalized.position.x).not.toBe(cell!.position.x);
  });
});
