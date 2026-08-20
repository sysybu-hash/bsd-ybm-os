"use client";

import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { WidgetType } from "@/hooks/use-window-manager";
import LauncherTile from "@/components/os/launcher/LauncherTile";
import {
  LAUNCHER_QUICK_TILE_WRAPPER_CLASS,
} from "@/lib/launcher/user-launcher-config";
import {
  quickGridCellId,
  type GridCellCoord,
} from "@/lib/launcher/quick-grid";
import type { LauncherZone } from "@/lib/launcher/user-launcher-config";

export function slotId(zone: LauncherZone, index: number) {
  return `${zone}-${index}`;
}

type SortableSlotProps = {
  zone: LauncherZone;
  index: number;
  widgetId: WidgetType | null;
  variant: "quick" | "sidebar" | "mobile";
  onOpen: (type: WidgetType) => void;
  disabled: boolean;
  gridCoord?: GridCellCoord;
  expanded?: boolean;
};

export function SortableSlot({
  zone,
  index,
  widgetId,
  variant,
  onOpen,
  disabled,
  gridCoord,
  expanded,
}: SortableSlotProps) {
  const id = gridCoord ? quickGridCellId(gridCoord.row, gridCoord.col) : slotId(zone, index);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={
        variant === "mobile"
          ? "min-w-0"
          : variant === "quick"
            ? LAUNCHER_QUICK_TILE_WRAPPER_CLASS
            : "md:w-full"
      }
      role={variant === "quick" || variant === "mobile" ? "listitem" : undefined}
    >
      <LauncherTile
        zone={zone}
        slotIndex={index}
        gridCoord={gridCoord}
        widgetId={widgetId}
        onOpen={onOpen}
        variant={variant}
        expanded={expanded}
        isDragging={isDragging}
        dragHandleProps={disabled ? undefined : { ...attributes, ...listeners }}
      />
    </div>
  );
}
