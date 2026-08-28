/**
 * @jest-environment jsdom
 */
import React from "react";
import { render } from "@testing-library/react";

/**
 * Escape has to reach the topmost thing on screen.
 *
 * OSWorkspace listens for Escape on `window` to close the focused widget, and so
 * does every OsFloatingPanel. Both fire, so pressing Escape over a dialog used
 * to close the dialog *and* the widget behind it. OSWorkspace now bows out while
 * a panel is open, which it learns from a module-level count kept by the panels
 * themselves.
 *
 * A count is only as good as its bookkeeping: leak one increment and Escape
 * stops closing widgets for the rest of the session, drop one too many and the
 * original double-close comes back. These tests pin the bookkeeping.
 */
jest.mock("@/components/os/system/I18nProvider", () => ({
  useI18n: () => ({ t: (key: string) => key, dir: "rtl" }),
}));
jest.mock("@/components/os/layout/WorkspaceWindowChrome", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("../usePanelDrag", () => ({
  usePanelDrag: () => ({
    offset: { x: 0, y: 0 },
    reset: jest.fn(),
    onHeaderPointerDown: jest.fn(),
    onHeaderPointerMove: jest.fn(),
    onHeaderPointerUp: jest.fn(),
  }),
}));
jest.mock("../useFocusTrap", () => ({ useFocusTrap: jest.fn() }));
jest.mock("@/hooks/use-is-mounted", () => ({ useIsMounted: () => true }));
jest.mock("framer-motion", () => {
  const React_ = jest.requireActual<typeof import("react")>("react");
  // One stable component per tag: returning a fresh function on every property
  // read makes React treat each render as a different component type and warn.
  const cache = new Map<string, unknown>();
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) =>
      React_.createElement(React_.Fragment, null, children),
    motion: new Proxy({} as Record<string, unknown>, {
      get: (_t, tag: string) => {
        if (!cache.has(tag)) {
          // forwardRef because the panel attaches panelRef to its motion element.
          const Tag = React_.forwardRef<
            HTMLDivElement,
            { children?: React.ReactNode }
          >(({ children }, ref) => React_.createElement("div", { ref }, children));
          Tag.displayName = `motion.${tag}`;
          cache.set(tag, Tag);
        }
        return cache.get(tag);
      },
    }),
  };
});

import OsFloatingPanel, { isAnyFloatingPanelOpen } from "../OsFloatingPanel";

function Panel(props: { open: boolean }) {
  return (
    <OsFloatingPanel open={props.open} onClose={jest.fn()} title="t">
      <p>body</p>
    </OsFloatingPanel>
  );
}

describe("isAnyFloatingPanelOpen", () => {
  it("is false with nothing rendered", () => {
    expect(isAnyFloatingPanelOpen()).toBe(false);
  });

  it("reports an open panel and clears when it closes", () => {
    const { rerender } = render(<Panel open />);
    expect(isAnyFloatingPanelOpen()).toBe(true);

    rerender(<Panel open={false} />);
    expect(isAnyFloatingPanelOpen()).toBe(false);
  });

  it("clears when an open panel unmounts without closing first", () => {
    const { unmount } = render(<Panel open />);
    expect(isAnyFloatingPanelOpen()).toBe(true);

    unmount();
    // The count would leak here if the effect only decremented on `open` going
    // false, and Escape would never reach a widget again.
    expect(isAnyFloatingPanelOpen()).toBe(false);
  });

  it("stays true while a second panel is still open", () => {
    const first = render(<Panel open />);
    const second = render(<Panel open />);
    expect(isAnyFloatingPanelOpen()).toBe(true);

    first.unmount();
    expect(isAnyFloatingPanelOpen()).toBe(true);

    second.unmount();
    expect(isAnyFloatingPanelOpen()).toBe(false);
  });

  it("does not count a panel that was never open", () => {
    render(<Panel open={false} />);
    expect(isAnyFloatingPanelOpen()).toBe(false);
  });

  it("survives repeated open/close cycles without drifting", () => {
    const { rerender } = render(<Panel open={false} />);
    for (let i = 0; i < 5; i++) {
      rerender(<Panel open />);
      expect(isAnyFloatingPanelOpen()).toBe(true);
      rerender(<Panel open={false} />);
      expect(isAnyFloatingPanelOpen()).toBe(false);
    }
  });
});
