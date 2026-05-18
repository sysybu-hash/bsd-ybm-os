"use client";

import React, { useMemo } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { WidgetType } from "@/hooks/use-window-manager";
import LauncherTile from "@/components/os/launcher/LauncherTile";
import {
  useLauncherConfig,
  useLauncherLongPress,
} from "@/components/os/launcher/LauncherConfigProvider";
import type { LauncherZone } from "@/lib/launcher/user-launcher-config";

type SortableLauncherZoneProps = {
  zone: LauncherZone;
  variant: "quick" | "sidebar" | "mobile";
  onOpen: (type: WidgetType) => void;
  className?: string;
};

function slotId(zone: LauncherZone, index: number) {
  return `${zone}-${index}`;
}

function SortableSlot({
  zone,
  index,
  widgetId,
  variant,
  onOpen,
  disabled,
}: {
  zone: LauncherZone;
  index: number;
  widgetId: WidgetType | null;
  variant: "quick" | "sidebar" | "mobile";
  onOpen: (type: WidgetType) => void;
  disabled: boolean;
}) {
  const id = slotId(zone, index);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className={variant === "mobile" ? "min-w-0" : undefined}>
      <LauncherTile
        zone={zone}
        slotIndex={index}
        widgetId={widgetId}
        onOpen={onOpen}
        variant={variant}
        isDragging={isDragging}
        dragHandleProps={disabled ? undefined : { ...attributes, ...listeners }}
      />
    </div>
  );
}

export default function SortableLauncherZone({
  zone,
  variant,
  onOpen,
  className,
}: SortableLauncherZoneProps) {
  const { editMode, enterEditMode, zoneSlots, reorderZone } = useLauncherConfig();
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

  const items = slots.map((slot, index) => {
    if (!editMode && !slot.widgetId && variant !== "mobile") return null;
    return (
      <SortableSlot
        key={ids[index]}
        zone={zone}
        index={index}
        widgetId={slot.widgetId}
        variant={variant}
        onOpen={onOpen}
        disabled={!editMode}
      />
    );
  });

  const inner = <SortableContext items={ids} strategy={strategy}>{items}</SortableContext>;

  const wrapperProps = {
    ...longPress,
    "data-testid": `launcher-zone-${zone}`,
    className: className ?? "",
  };

  if (!editMode) {
    return <div {...wrapperProps}>{inner}</div>;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <div {...wrapperProps}>{inner}</div>
    </DndContext>
  );
}
