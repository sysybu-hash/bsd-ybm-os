/**
 * Single source of truth for widget scroll layout inside a window shell.
 *
 * Mental model — the shell is the ONLY scroll owner, identically on desktop and
 * mobile. A widget is exactly one of two shapes:
 *
 *  1. FLOW (default): content just flows top-to-bottom. The shell scroll host
 *     (`[data-shell-scroll]`) grows and scrolls. The widget sets NO overflow /
 *     h-full / max-h of its own — it must not trap scroll.
 *
 *  2. STICKY-CHROME: a fixed header and/or footer with a single inner scroll
 *     pane between them. The widget root carries `data-widget-sticky-chrome`
 *     and fills the shell host exactly (height:100%, overflow:hidden via
 *     globals.css); the inner `data-widget-scroll-pane` owns vertical scroll.
 *
 * The actual height/overflow wiring lives in app/globals.css keyed off these
 * data-attributes and is the SAME across breakpoints (the only desktop/mobile
 * difference is window chrome + sizing, never the scroll mechanism). Components
 * should use <WindowBody> rather than reproducing these class strings.
 */

/** Widgets with fixed header/footer that keep an inner scroll pane. */
export const WIDGET_STICKY_CHROME_ATTR = "data-widget-sticky-chrome" as const;

/** Inner scroll region inside a sticky-chrome widget. */
export const WIDGET_SCROLL_PANE_ATTR = "data-widget-scroll-pane" as const;

/**
 * Root class for a sticky-chrome widget. Height/overflow are supplied by
 * globals.css via the data-attribute; this only sets flex direction + bg hooks.
 */
export const widgetStickyRootClass =
  "flex min-h-0 w-full flex-col overflow-hidden";

/**
 * Inner scroll pane class for a sticky-chrome widget. Height/flex are supplied
 * by globals.css; this only carries the scrollbar styling + momentum scroll.
 */
export const widgetScrollPaneClass =
  "custom-scrollbar overscroll-y-contain [-webkit-overflow-scrolling:touch]";

/**
 * Root class for a flow widget. No overflow / height — the shell scrolls. Pad
 * via the consumer's own className.
 */
export const widgetFlowRootClass = "flex w-full flex-col";
