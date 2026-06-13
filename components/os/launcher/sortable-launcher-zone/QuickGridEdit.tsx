"use client";

import React, { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { WidgetType } from "@/hooks/use-window-manager";
import LauncherTile from "@/components/os/launcher/LauncherTile";
import {
  LAUNCHER_QUICK_EDIT_GRID_CLASS,
  LAUNCHER_QUICK_EDIT_SCROLL_CLASS,
  LAUNCHER_QUICK_TILE_WRAPPER_CLASS,
} from "@/lib/launcher/user-launcher-config";
import {
  buildQuickGridEditMatrix,
  parseQuickGridCellId,
  parseQuickGridDragId,
  quickGridCellId,
  quickGridDragId,
  quickGridEditInlineStyle,
  type GridCellCoord,
  type QuickGridCell,
} from "@/lib/launcher/quick-grid";
import type { LauncherSlot, LauncherZone } from "@/lib/launcher/user-launcher-config";

// ── QuickGridEditCell ──────────────────────────────────────────────────────

function QuickGridEditCell({
  cell,
  zone,
  linearIndex,
  onOpen,
}: {
  cell: QuickGridCell;
  zone: LauncherZone;
  linearIndex: number;
  onOpen: (type: WidgetType) => void;
}) {
  const dropId = quickGridCellId(cell.row, cell.col);
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: dropId });
  const hasWidget = cell.widgetId !== null;
  const dragId = quickGridDragId(cell.row, cell.col);
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: dragId,
    disabled: !hasWidget,
    data: { row: cell.row, col: cell.col },
  });

  const setRef = (node: HTMLElement | null) => {
    setDropRef(node);
    if (hasWidget) setDragRef(node);
  };

  return (
    <div
      ref={setRef}
      className={`${LAUNCHER_QUICK_TILE_WRAPPER_CLASS} rounded-lg ${
        isOver ? "ring-2 ring-indigo-400/80 ring-offset-1 ring-offset-[color:var(--surface-main)]" : ""
      } ${isDragging ? "opacity-40" : ""}`}
      role="listitem"
      data-testid={hasWidget ? `launcher-grid-cell-${cell.row}-${cell.col}` : `launcher-grid-empty-${cell.row}-${cell.col}`}
    >
      <LauncherTile
        zone={zone}
        slotIndex={linearIndex}
        gridCoord={{ row: cell.row, col: cell.col }}
        widgetId={cell.widgetId}
        onOpen={onOpen}
        variant="quick"
        isDragging={isDragging}
        compactEmpty={!hasWidget}
        suppressJiggle
        dragHandleProps={hasWidget ? { ...attributes, ...listeners } : undefined}
      />
    </div>
  );
}

// ── QuickGridEdit ──────────────────────────────────────────────────────────

type QuickGridEditProps = {
  zone: LauncherZone;
  slots: LauncherSlot[];
  onOpen: (type: WidgetType) => void;
  moveQuickGridCell: (from: GridCellCoord, to: GridCellCoord) => void;
};

export function QuickGridEdit({
  zone,
  slots,
  onOpen,
  moveQuickGridCell,
}: QuickGridEditProps) {
  const matrix = useMemo(() => buildQuickGridEditMatrix(slots, true), [slots]);
  const totalRows = matrix.length;
  const totalCols = matrix[0]?.length ?? 0;
  const gridStyle = useMemo(
    () => quickGridEditInlineStyle(totalCols, totalRows),
    [totalCols, totalRows],
  );

  const [activeDrag, setActiveDrag] = useState<QuickGridCell | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const onDragStart = (event: DragStartEvent) => {
    const from = parseQuickGridDragId(String(event.active.id));
    if (!from) return;
    const row = matrix[from.row];
    const cell = row?.[from.col];
    if (cell?.widgetId) setActiveDrag(cell);
  };

  const onDragEnd = (event: DragEndEvent) => {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over) return;
    const from = parseQuickGridDragId(String(active.id));
    const to = parseQuickGridCellId(String(over.id));
    if (!from || !to) return;
    if (from.row === to.row && from.col === to.col) return;
    moveQuickGridCell(from, to);
  };

  const onDragCancel = () => setActiveDrag(null);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <div
        className={`${LAUNCHER_QUICK_EDIT_SCROLL_CLASS} relative z-10 bg-[color:var(--background-main)]`}
      >
        <div
          className={LAUNCHER_QUICK_EDIT_GRID_CLASS}
          style={gridStyle}
          data-testid="launcher-quick-grid-edit"
        >
          {matrix.map((row) =>
            row.map((cell) => {
              const linearIndex = cell.row * totalCols + cell.col;
              return (
                <QuickGridEditCell
                  key={quickGridCellId(cell.row, cell.col)}
                  cell={cell}
                  zone={zone}
                  linearIndex={linearIndex}
                  onOpen={onOpen}
                />
              );
            }),
          )}
        </div>
      </div>
      <DragOverlay dropAnimation={null}>
        {activeDrag?.widgetId ? (
          <div
            className={`${LAUNCHER_QUICK_TILE_WRAPPER_CLASS} h-[140px] w-[140px] scale-105 shadow-xl`}
          >
            <LauncherTile
              zone={zone}
              slotIndex={activeDrag.row * totalCols + activeDrag.col}
              gridCoord={{ row: activeDrag.row, col: activeDrag.col }}
              widgetId={activeDrag.widgetId}
              onOpen={onOpen}
              variant="quick"
              isDragging
              suppressJiggle
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
