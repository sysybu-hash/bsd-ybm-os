"use client";

import React from "react";

/**
 * Shared layout primitives for widget content.
 *
 * The OS shell sizes every widget to its WINDOW, not the viewport. Historically
 * widgets laid out with `sm:/md:/lg:` (viewport) breakpoints, so a wide window
 * still rendered a narrow single column — leaving large empty gutters.
 *
 * `WidgetCanvas` turns the content region into a CSS size container (via the
 * `.widget-canvas` class in globals.css). Children can then reflow with
 * Tailwind's `@`-prefixed container-query variants (e.g. `@2xl:grid-cols-2`),
 * which respond to the window width — correct for both floating and maximized
 * windows.
 *
 * Container width breakpoints (Tailwind container-queries plugin defaults):
 *   @sm 24rem · @md 28rem · @lg 32rem · @xl 36rem · @2xl 42rem · @3xl 48rem …
 */

type AsProp = "div" | "section" | "form";

export interface WidgetCanvasProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Element tag to render. Defaults to `div`. */
  as?: AsProp;
  /**
   * Cap the content width on very large windows so text lines / forms don't
   * stretch uncomfortably wide. Pass `"none"` to fill the full width (tables,
   * boards, calendars). Defaults to a comfortable reading/work width.
   */
  maxWidth?: "none" | "prose" | "wide" | "full";
}

const MAX_WIDTH_CLASS: Record<NonNullable<WidgetCanvasProps["maxWidth"]>, string> = {
  none: "",
  full: "",
  prose: "mx-auto w-full max-w-[70ch]",
  wide: "mx-auto w-full max-w-[88rem]",
};

/**
 * Establishes the size container + consistent gutters. Place this as the inner
 * wrapper of a widget's scroll region (or pass `data-widget-scroll-pane` via
 * props when it *is* the scroll pane).
 */
export function WidgetCanvas({
  as = "div",
  maxWidth = "wide",
  className = "",
  children,
  ...rest
}: WidgetCanvasProps) {
  const Tag = as as React.ElementType;
  return (
    <Tag
      className={`widget-canvas ${MAX_WIDTH_CLASS[maxWidth]} ${className}`.trim()}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export interface WidgetColumnsProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Window-width breakpoint at which the layout splits into two columns.
   * Maps to the container-query variant. Defaults to `@2xl` (~42rem).
   */
  splitAt?: "@xl" | "@2xl" | "@3xl" | "@4xl";
  /** Column template once split. Defaults to equal halves. */
  template?: "1-1" | "3-2" | "2-3" | "2-1" | "1-2";
}

const SPLIT_GRID: Record<NonNullable<WidgetColumnsProps["splitAt"]>, Record<NonNullable<WidgetColumnsProps["template"]>, string>> = {
  "@xl": {
    "1-1": "@xl:grid-cols-2",
    "3-2": "@xl:grid-cols-[3fr_2fr]",
    "2-3": "@xl:grid-cols-[2fr_3fr]",
    "2-1": "@xl:grid-cols-[2fr_1fr]",
    "1-2": "@xl:grid-cols-[1fr_2fr]",
  },
  "@2xl": {
    "1-1": "@2xl:grid-cols-2",
    "3-2": "@2xl:grid-cols-[3fr_2fr]",
    "2-3": "@2xl:grid-cols-[2fr_3fr]",
    "2-1": "@2xl:grid-cols-[2fr_1fr]",
    "1-2": "@2xl:grid-cols-[1fr_2fr]",
  },
  "@3xl": {
    "1-1": "@3xl:grid-cols-2",
    "3-2": "@3xl:grid-cols-[3fr_2fr]",
    "2-3": "@3xl:grid-cols-[2fr_3fr]",
    "2-1": "@3xl:grid-cols-[2fr_1fr]",
    "1-2": "@3xl:grid-cols-[1fr_2fr]",
  },
  "@4xl": {
    "1-1": "@4xl:grid-cols-2",
    "3-2": "@4xl:grid-cols-[3fr_2fr]",
    "2-3": "@4xl:grid-cols-[2fr_3fr]",
    "2-1": "@4xl:grid-cols-[2fr_1fr]",
    "1-2": "@4xl:grid-cols-[1fr_2fr]",
  },
};

/**
 * One column on narrow windows, two columns once the window is wide enough.
 * Use inside a `WidgetCanvas`. The break responds to window width.
 */
export function WidgetColumns({
  splitAt = "@2xl",
  template = "1-1",
  className = "",
  children,
  ...rest
}: WidgetColumnsProps) {
  return (
    <div
      className={`grid grid-cols-1 gap-4 @2xl:gap-6 ${SPLIT_GRID[splitAt][template]} ${className}`.trim()}
      {...rest}
    >
      {children}
    </div>
  );
}
