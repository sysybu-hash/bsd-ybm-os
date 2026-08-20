"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Group, Panel, Separator, useDefaultLayout, type Layout } from "react-resizable-panels";

const MOBILE_BREAKPOINT_PX = 768;

export type WidgetSplitPanelSpec = {
  id: string;
  defaultSize: number | string;
  minSize: number | string;
  maxSize?: number | string;
  groupResizeBehavior?: "preserve-relative-size" | "preserve-pixel-size";
  className?: string;
  children: React.ReactNode;
};

type WidgetSplitPanelsProps = {
  direction?: "horizontal" | "vertical";
  stackBelowPx?: number;
  className?: string;
  separatorClassName?: string;
  layoutStorageKey?: string;
  panels: WidgetSplitPanelSpec[];
};

/** In v4, bare numbers are pixels — our API uses numbers as percentages. */
function toPanelSize(value: number | string | undefined): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (trimmed.endsWith("%") || trimmed.endsWith("px") || /[a-z]+$/i.test(trimmed)) {
      return trimmed;
    }
    return `${trimmed}%`;
  }
  return `${value}%`;
}

type SplitGroupProps = Omit<WidgetSplitPanelsProps, "layoutStorageKey"> & {
  defaultLayout?: Layout;
  onLayoutChanged?: (layout: Layout) => void;
};

function WidgetSplitPanelsGroup({
  direction = "horizontal",
  stackBelowPx = MOBILE_BREAKPOINT_PX,
  className = "min-h-0 flex-1",
  separatorClassName,
  panels,
  defaultLayout,
  onLayoutChanged,
}: SplitGroupProps) {
  const [stacked, setStacked] = useState(false);

  useEffect(() => {
    const readShortEdge = () => {
      const w = window.visualViewport?.width ?? window.innerWidth;
      const h = window.visualViewport?.height ?? window.innerHeight;
      return Math.min(w, h);
    };
    let stackedNow = readShortEdge() < stackBelowPx;

    const apply = () => {
      const shortEdge = readShortEdge();
      if (stackedNow) {
        if (shortEdge >= stackBelowPx + 48) stackedNow = false;
      } else if (shortEdge < stackBelowPx) {
        stackedNow = true;
      }
      setStacked(stackedNow);
    };

    apply();
    window.addEventListener("resize", apply);
    window.visualViewport?.addEventListener("resize", apply);
    return () => {
      window.removeEventListener("resize", apply);
      window.visualViewport?.removeEventListener("resize", apply);
    };
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
      ? "h-1.5 shrink-0 bg-[color:var(--border-main)] transition-colors hover:bg-indigo-500/35 active:bg-indigo-500/50"
      : "w-1.5 shrink-0 cursor-col-resize bg-[color:var(--border-main)] transition-colors hover:bg-indigo-500/35 active:bg-indigo-500/50");

  return (
    <Group
      orientation={orientation}
      className={className}
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
    >
      {panels.map((panel, index) => (
        <React.Fragment key={panel.id}>
          {index > 0 ? <Separator className={separator} /> : null}
          <Panel
            id={panel.id}
            defaultSize={toPanelSize(panel.defaultSize)}
            minSize={toPanelSize(panel.minSize)}
            maxSize={toPanelSize(panel.maxSize)}
            groupResizeBehavior={panel.groupResizeBehavior}
            className={panel.className ?? "flex min-h-0 min-w-0 flex-col"}
          >
            {panel.children}
          </Panel>
        </React.Fragment>
      ))}
    </Group>
  );
}

function WidgetSplitPanelsPersisted({
  layoutStorageKey,
  panels,
  ...rest
}: WidgetSplitPanelsProps & { layoutStorageKey: string }) {
  const panelIds = useMemo(() => panels.map((panel) => panel.id), [panels]);
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: layoutStorageKey,
    panelIds,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  });

  return (
    <WidgetSplitPanelsGroup
      {...rest}
      panels={panels}
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
    />
  );
}

export default function WidgetSplitPanels(props: WidgetSplitPanelsProps) {
  if (props.layoutStorageKey) {
    return <WidgetSplitPanelsPersisted {...props} layoutStorageKey={props.layoutStorageKey} />;
  }
  return <WidgetSplitPanelsGroup {...props} />;
}
