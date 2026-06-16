"use client";

import React, { useMemo } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { WidgetType } from "@/hooks/use-window-manager";
import { normalizeWidgetAction } from "@/lib/os-assistant/widget-catalog";
import {
  useLauncherConfig,
  useLauncherLongPress,
} from "@/components/os/launcher/LauncherConfigProvider";
import { splitIntoBalancedRows } from "@/lib/launcher/launcher-grid-layout";
import { quickGridCellId, type GridCellCoord } from "@/lib/launcher/quick-grid";
import type { LauncherZone } from "@/lib/launcher/user-launcher-config";
import {
  LAUNCHER_QUICK_GRID_CONTAINER_CLASS,
  LAUNCHER_QUICK_ROW_CLASS,
} from "@/lib/launcher/user-launcher-config";
import { SortableSlot, slotId } from "./sortable-launcher-zone/SortableSlot";
import { QuickGridPositionView } from "./sortable-launcher-zone/QuickGridPositionView";
import { QuickGridMobileColumnView } from "./sortable-launcher-zone/QuickGridMobileColumnView";
import { QuickGridEdit } from "./sortable-launcher-zone/QuickGridEdit";

type SortableLauncherZoneProps = {
  zone: LauncherZone;
  variant: "quick" | "sidebar" | "mobile";
  onOpen: (type: WidgetType) => void;
  className?: string;
  /** סרגל צד מורחב — אייקון + תווית */
  expanded?: boolean;
};

export default function SortableLauncherZone({
  zone,
  variant,
  onOpen,
  className,
  expanded,
}: SortableLauncherZoneProps) {
  const { editMode, enterEditMode, zoneSlots, reorderZone, moveQuickGridCell } =
    useLauncherConfig();
  const slots = zoneSlots(zone);
  const longPress = useLauncherLongPress(enterEditMode, !editMode);

  const ids = useMemo(() => slots.map((_, i) => slotId(zone, i)), [slots, zone]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = ids.indexOf(String(active.id));
    const toIndex = ids.indexOf(String(over.id));
    if (fromIndex < 0 || toIndex < 0) return;
    reorderZone(zone, fromIndex, toIndex);
  };

  const strategy = variant === "sidebar" ? verticalListSortingStrategy : rectSortingStrategy;

  const slotEntries = slots.map((slot, index) => ({ slot, index }));

  const renderSlot = (index: number, gridCoord?: GridCellCoord) => {
    const slot = slots[index];
    if (!slot) return null;
    const displayable =
      slot.widgetId !== null && normalizeWidgetAction(slot.widgetId) !== null;
    if (!editMode && !displayable && variant !== "mobile") return null;
    return (
      <SortableSlot
        key={gridCoord ? quickGridCellId(gridCoord.row, gridCoord.col) : ids[index]}
        zone={zone}
        index={index}
        gridCoord={gridCoord}
        widgetId={slot.widgetId}
        variant={variant}
        expanded={expanded}
        onOpen={onOpen}
        disabled={!editMode}
      />
    );
  };

  const renderFlat = () => slotEntries.map(({ index }) => renderSlot(index));

  const renderQuickRows = () => {
    const visible = editMode
      ? slotEntries
      : slotEntries.filter(
          ({ slot }) =>
            slot.widgetId !== null && normalizeWidgetAction(slot.widgetId) !== null,
        );
    const rows = splitIntoBalancedRows(visible);
    return rows.map((row, rowIndex) => (
      <div key={`row-${rowIndex}`} className={LAUNCHER_QUICK_ROW_CLASS} role="list">
        {row.map(({ index }) => renderSlot(index))}
      </div>
    ));
  };

  const isQuickGrid = variant === "quick" && zone === "quickGrid";

  let items: React.ReactNode;
  if (isQuickGrid && editMode) {
    items = (
      <QuickGridEdit
        zone={zone}
        slots={slots}
        onOpen={onOpen}
        moveQuickGridCell={moveQuickGridCell}
      />
    );
  } else if (isQuickGrid) {
    items = (
      <>
        <QuickGridPositionView zone={zone} slots={slots} onOpen={onOpen} />
        <QuickGridMobileColumnView zone={zone} slots={slots} onOpen={onOpen} />
      </>
    );
  } else if (variant === "quick") {
    items = renderQuickRows();
  } else {
    items = renderFlat();
  }

  const inner =
    isQuickGrid ? (
      items
    ) : editMode ? (
      <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={strategy}>
          {variant === "quick" ? renderQuickRows() : renderFlat()}
        </SortableContext>
      </DndContext>
    ) : (
      <SortableContext items={ids} strategy={strategy}>
        {variant === "quick" ? renderQuickRows() : renderFlat()}
      </SortableContext>
    );

  const wrapperProps = {
    ...longPress,
    "data-testid": `launcher-zone-${zone}`,
    className: isQuickGrid
      ? [
          LAUNCHER_QUICK_GRID_CONTAINER_CLASS,
          editMode
            ? "relative z-20 flex min-h-0 max-h-full w-full flex-1 flex-col items-center justify-center overflow-hidden bg-[color:var(--background-main)]"
            : "",
          className,
        ]
          .filter(Boolean)
          .join(" ")
      : (className ?? ""),
  };

  return (
    <div {...wrapperProps}>
      {inner}
    </div>
  );
}
