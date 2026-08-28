/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, renderHook } from "@testing-library/react";
import { useAdaptiveShellDragResize } from "../useAdaptiveShellDragResize";

/** jsdom has no ResizeObserver; capture the callback so tests can fire it. */
let observerCallbacks: ResizeObserverCallback[] = [];
class FakeResizeObserver {
  constructor(cb: ResizeObserverCallback) {
    observerCallbacks.push(cb);
  }
  observe() {}
  disconnect() {}
  unobserve() {}
}

function workspaceOf(width: number, height: number) {
  const el = document.createElement("div");
  Object.defineProperty(el, "clientWidth", { value: width, configurable: true });
  Object.defineProperty(el, "clientHeight", { value: height, configurable: true });
  document.body.appendChild(el);
  return el;
}

function resizeWorkspace(el: HTMLElement, width: number, height: number) {
  Object.defineProperty(el, "clientWidth", { value: width, configurable: true });
  Object.defineProperty(el, "clientHeight", { value: height, configurable: true });
  act(() => {
    observerCallbacks.forEach((cb) => cb([], {} as ResizeObserver));
  });
}

function setup(el: HTMLElement, over: Partial<Parameters<typeof useAdaptiveShellDragResize>[0]> = {}) {
  const ref = { current: el } as React.RefObject<HTMLElement | null>;
  return renderHook(() =>
    useAdaptiveShellDragResize({
      size: { width: 600, height: 400 },
      isMaximized: false,
      workspaceBoundsRef: ref,
      zoom: 1,
      dir: "rtl",
      ...over,
    }),
  );
}

beforeEach(() => {
  observerCallbacks = [];
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = FakeResizeObserver;
  window.innerWidth = 1400;
  window.innerHeight = 900;
  document.body.innerHTML = "";
});

describe("useAdaptiveShellDragResize", () => {
  it("measures the workspace element rather than the viewport", () => {
    const { result } = setup(workspaceOf(1000, 700));
    expect(result.current.ws).toEqual({ width: 1000, height: 700 });
  });

  it("centres a desktop window inside the measured workspace", () => {
    const { result } = setup(workspaceOf(1000, 700));
    const { position, currentSize } = result.current;
    expect(position.x).toBe(Math.round(1000 / 2 - currentSize.width / 2));
  });

  /**
   * The behaviour the previous render-time ref read could not deliver: nothing
   * else changes state when the workspace shrinks, so without an observer the
   * window kept painting at its old clamp until some unrelated render.
   */
  it("re-clamps the window when the workspace shrinks under it", () => {
    const el = workspaceOf(1200, 800);
    // 500 sits inside a 1200-wide workspace holding a 600-wide window
    // (max x = 1200 - 600 = 600), so it starts unclamped.
    const { result } = setup(el, { initialOffset: { x: 500, y: 300 } });
    expect(result.current.clampedLeft).toBe(500);

    resizeWorkspace(el, 700, 500);

    expect(result.current.ws).toEqual({ width: 700, height: 500 });
    // max x is now 700 - 600 = 100, so the window has to move.
    expect(result.current.clampedLeft).toBe(
      Math.max(0, 700 - result.current.currentSize.width),
    );
    expect(result.current.clampedLeft).toBeLessThan(500);
  });

  it("does not report a new workspace size when the dimensions are unchanged", () => {
    const el = workspaceOf(1000, 700);
    const { result } = setup(el);
    const before = result.current.ws;
    resizeWorkspace(el, 1000, 700);
    // Same object identity: a resize event that changed nothing must not
    // cascade a render through every consumer of `ws`.
    expect(result.current.ws).toBe(before);
  });

  it("falls back to the viewport when no workspace element is attached", () => {
    const ref = { current: null } as React.RefObject<HTMLElement | null>;
    const { result } = renderHook(() =>
      useAdaptiveShellDragResize({
        size: { width: 600, height: 400 },
        isMaximized: false,
        workspaceBoundsRef: ref,
        zoom: 1,
        dir: "rtl",
      }),
    );
    expect(result.current.ws).toEqual({ width: 1400 - 24, height: 900 - 130 });
  });
});
