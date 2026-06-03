"use client";

import React from "react";

interface StickyPanelHeaderProps {
  title?: React.ReactNode;
  /** Extra content rendered on the trailing side (buttons, badges, etc.) */
  children?: React.ReactNode;
  className?: string;
}

/**
 * A glassmorphic sticky header for widget panels and sidebars.
 * Replaces the repeated pattern:
 *   "sticky top-0 z-10 border-b border-border-main bg-surface-bg/95 backdrop-blur-sm px-4 py-3"
 */
export function StickyPanelHeader({ title, children, className = "" }: StickyPanelHeaderProps) {
  return (
    <header
      className={`sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border-main bg-surface-bg/95 backdrop-blur-sm px-4 py-3 ${className}`}
    >
      {title && (
        <h3 className="min-w-0 truncate text-sm font-semibold tracking-tight text-foreground-main">
          {title}
        </h3>
      )}
      {children && (
        <div className="flex shrink-0 items-center gap-2">{children}</div>
      )}
    </header>
  );
}
