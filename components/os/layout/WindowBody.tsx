"use client";

import React from "react";
import {
  WIDGET_STICKY_CHROME_ATTR,
  WIDGET_SCROLL_PANE_ATTR,
  widgetStickyRootClass,
  widgetScrollPaneClass,
  widgetFlowRootClass,
} from "@/lib/workspace/widget-shell-layout";

/**
 * The canonical body for any widget rendered inside a window shell.
 *
 * Two mutually exclusive shapes — see lib/workspace/widget-shell-layout.ts:
 *
 *  Flow (default):
 *    <WindowBody className="gap-4 p-3 md:p-6">…</WindowBody>
 *  Content flows; the shell owns the single scroll. Do NOT add overflow / h-full
 *  / max-h inside — that re-introduces the desktop/mobile divergence this fixes.
 *
 *  Sticky chrome:
 *    <WindowBody sticky header={<Header/>} footer={<Footer/>} scrollClassName="p-3">
 *      …scrollable content…
 *    </WindowBody>
 *  Header/footer stay fixed; the inner pane is the only scroller.
 */

type CommonProps = {
  children: React.ReactNode;
  className?: string;
  dir?: "rtl" | "ltr";
  /** Forwarded to the root element (role, aria-*, tabIndex, etc.). */
  role?: string;
  "aria-label"?: string;
  tabIndex?: number;
};

type FlowProps = CommonProps & {
  sticky?: false;
};

type StickyProps = CommonProps & {
  sticky: true;
  /** Fixed region above the scroll pane. */
  header?: React.ReactNode;
  /** Fixed region below the scroll pane. */
  footer?: React.ReactNode;
  /** Class applied to the inner scroll pane (padding, gap, etc.). */
  scrollClassName?: string;
  /** Extra attributes for the inner scroll pane. */
  scrollProps?: React.HTMLAttributes<HTMLDivElement>;
};

export type WindowBodyProps = FlowProps | StickyProps;

export default function WindowBody(props: WindowBodyProps) {
  const { children, className, dir, role, tabIndex } = props;
  const ariaLabel = props["aria-label"];

  if (props.sticky) {
    const { header, footer, scrollClassName, scrollProps } = props;
    return (
      <div
        {...{ [WIDGET_STICKY_CHROME_ATTR]: "" }}
        className={cx(widgetStickyRootClass, className)}
        dir={dir}
        role={role}
        aria-label={ariaLabel}
        tabIndex={tabIndex}
      >
        {header}
        <div
          {...{ [WIDGET_SCROLL_PANE_ATTR]: "" }}
          {...scrollProps}
          className={cx(widgetScrollPaneClass, scrollClassName, scrollProps?.className)}
        >
          {children}
        </div>
        {footer}
      </div>
    );
  }

  return (
    <div
      className={cx(widgetFlowRootClass, className)}
      dir={dir}
      role={role}
      aria-label={ariaLabel}
      tabIndex={tabIndex}
    >
      {children}
    </div>
  );
}

function cx(...parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
