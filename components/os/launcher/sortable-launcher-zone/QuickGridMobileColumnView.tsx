"use client";

import React, { useMemo } from "react";
import type { WidgetType } from "@/hooks/use-window-manager";
import { normalizeWidgetAction } from "@/lib/os-assistant/widget-catalog";
import LauncherTile from "@/components/os/launcher/LauncherTile";
import {
  LAUNCHER_QUICK_MOBILE_GRID_CLASS,
  LAUNCHER_QUICK_MOBILE_TILE_WRAPPER_CLASS,
} from "@/lib/launcher/user-launcher-config";
import {
  quickGridSlotsInDisplayOrder,
  slotHasGridPosition,
} from "@/lib/launcher/quick-grid";
import type { LauncherSlot, LauncherZone } from "@/lib/launcher/user-launcher-config";

type QuickGridMobileColumnViewProps = {
  zone: LauncherZone;
  slots: LauncherSlot[];
  onOpen: (type: WidgetType) => void;
};

export function QuickGridMobileColumnView({ zone, slots, onOpen }: QuickGridMobileColumnViewProps) {
  const ordered = useMemo(() => quickGridSlotsInDisplayOrder(slots), [slots]);
  const visible = useMemo(
    () =>
      ordered.filter(
        (slot) => slot.widgetId !== null && normalizeWidgetAction(slot.widgetId) !== null,
      ),
    [ordered],
  );

  return (
    <div
      className={LAUNCHER_QUICK_MOBILE_GRID_CLASS}
      role="list"
      data-testid="launcher-quick-mobile-grid"
    >
      {visible.map((slot, index) => (
        <div
          key={`${slot.row ?? 0}-${slot.col ?? 0}-${slot.widgetId}`}
          className={LAUNCHER_QUICK_MOBILE_TILE_WRAPPER_CLASS}
          role="listitem"
        >
          <LauncherTile
            zone={zone}
            slotIndex={index}
            gridCoord={
              slotHasGridPosition(slot) ? { row: slot.row!, col: slot.col! } : undefined
            }
            widgetId={slot.widgetId}
            onOpen={onOpen}
            variant="quick"
            tileSize="mobile"
          />
        </div>
      ))}
    </div>
  );
}
