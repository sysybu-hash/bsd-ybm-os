"use client";

import React, { useEffect, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";

const MOBILE_BREAKPOINT_PX = 768;

export type WidgetSplitPanelSpec = {
  id: string;
  defaultSize: number;
  minSize: number;
  className?: string;
  children: React.ReactNode;
};

type WidgetSplitPanelsProps = {
  direction?: "horizontal" | "vertical";
  stackBelowPx?: number;
  className?: string;
  separatorClassName?: string;
  panels: WidgetSplitPanelSpec[];
};

export default function WidgetSplitPanels({
  direction = "horizontal",
  stackBelowPx = MOBILE_BREAKPOINT_PX,
  className = "min-h-0 flex-1",
  separatorClassName,
  panels,
}: WidgetSplitPanelsProps) {
  const [stacked, setStacked] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${stackBelowPx - 1}px)`);
    const apply = () => setStacked(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [stackBelowPx]);

  if (panels.length === 0) return null;
  if (panels.length === 1) {
    return <div className={className}>{panels[0]!.children}</div>;
  }

  const orientation =
    stacked && direction === "horizontal"
      ? "vertical"
      : stacked && direction === "vertical"
        ? "horizontal"
        : direction;

  const separator =
    separatorClassName ??
    (orientation === "vertical"
      ? "h-1.5 shrink-0 bg-[color:var(--border-main)] transition-colors hover:bg-indigo-500/35"
      : "w-1.5 shrink-0 bg-[color:var(--border-main)] transition-colors hover:bg-indigo-500/35");

  return (
    <Group orientation={orientation} className={className}>
      {panels.map((panel, index) => (
        <React.Fragment key={panel.id}>
          {index > 0 ? <Separator className={separator} /> : null}
          <Panel
            defaultSize={panel.defaultSize}
            minSize={panel.minSize}
            className={panel.className ?? "flex min-h-0 min-w-0 flex-col"}
          >
            {panel.children}
          </Panel>
        </React.Fragment>
      ))}
    </Group>
  );
}
