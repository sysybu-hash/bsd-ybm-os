/**
 * Layout classes for widgets inside AdaptiveWidgetShell.
 * On mobile the shell owns vertical scroll unless marked sticky-chrome.
 */

/** Widgets with fixed header/footer that keep an inner scroll pane on mobile. */
export const WIDGET_STICKY_CHROME_ATTR = "data-widget-sticky-chrome" as const;

/** Inner scroll region inside a sticky-chrome widget (mobile flex height fix). */
export const WIDGET_SCROLL_PANE_ATTR = "data-widget-scroll-pane" as const;

export const widgetRootClass = (stickyChrome = false) =>
  stickyChrome
    ? "flex h-full min-h-0 w-full flex-col overflow-hidden"
    : "flex w-full min-h-0 flex-col overflow-hidden max-md:overflow-visible md:h-full";

export const widgetScrollPaneClass =
  "custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]";
