"use client";

import React, { useMemo } from "react";
import type { WidgetType } from "@/hooks/use-window-manager";
import { normalizeWidgetAction } from "@/lib/os-assistant/widget-catalog";
import LauncherTile from "@/components/os/launcher/LauncherTile";
import {
  LAUNCHER_QUICK_DESKTOP_GRID_CLASS,
  LAUNCHER_QUICK_DESKTOP_WRAP_CLASS,
  LAUNCHER_QUICK_TILE_WRAPPER_CLASS,
} from "@/lib/launcher/user-launcher-config";
import {
  getQuickGridViewExtents,
  quickGridInlineStyle,
  quickGridSlotsForView,
  slotHasGridPosition,
} from "@/lib/launcher/quick-grid";
import type { LauncherSlot, LauncherZone } from "@/lib/launcher/user-launcher-config";

type QuickGridPositionViewProps = {
  zone: LauncherZone;
  slots: LauncherSlot[];
  onOpen: (type: WidgetType) => void;
};

export function QuickGridPositionView({ zone, slots, onOpen }: QuickGridPositionViewProps) {
  const positioned = useMemo(() => quickGridSlotsForView(slots), [slots]);
  const viewExtents = useMemo(() => getQuickGridViewExtents(positioned), [positioned]);
  const gridStyle = useMemo(
    () => quickGridInlineStyle(viewExtents.cols, viewExtents.rows),
    [viewExtents.cols, viewExtents.rows],
  );

  return (
    <div className={LAUNCHER_QUICK_DESKTOP_WRAP_CLASS}>
      <div
        className={LAUNCHER_QUICK_DESKTOP_GRID_CLASS}
        style={gridStyle}
        role="list"
        data-testid="launcher-quick-grid-view"
      >
        {positioned.map((slot, index) => {
          if (!slot.widgetId || !slotHasGridPosition(slot)) return null;
          if (normalizeWidgetAction(slot.widgetId) === null) return null;
          return (
            <div
              key={`${slot.row}-${slot.col}-${slot.widgetId}`}
              style={{
                gridColumnStart: slot.col! - viewExtents.minCol + 1,
                gridRowStart: slot.row! - viewExtents.minRow + 1,
              }}
              className={LAUNCHER_QUICK_TILE_WRAPPER_CLASS}
              role="listitem"
            >
              <LauncherTile
                zone={zone}
                slotIndex={index}
                gridCoord={{ row: slot.row!, col: slot.col! }}
                widgetId={slot.widgetId}
                onOpen={onOpen}
                variant="quick"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
