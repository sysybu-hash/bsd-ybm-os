"use client";

import React from "react";

type ClassicPaneProps = {
  title: string;
  children: React.ReactNode;
  /** When true, no title chrome — content fills the pane (e.g. home overview). */
  bare?: boolean;
};

/**
 * Chrome עקבי לטאבי מצב קלאסי — כותרת דקה + אזור תוכן, בלי לשכתב וידג'טים.
 */
export function ClassicPane({ title, children, bare }: ClassicPaneProps) {
  if (bare) {
    return <div className="min-h-0">{children}</div>;
  }

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <h2 className="border-b border-[color:var(--classic-rule)] pb-3 text-lg font-bold tracking-tight text-[color:var(--classic-ink)]">
        {title}
      </h2>
      <div className="min-h-0">{children}</div>
    </div>
  );
}
