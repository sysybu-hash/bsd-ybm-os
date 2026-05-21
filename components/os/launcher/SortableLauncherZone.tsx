"use client";



import React, { useEffect, useMemo, useRef, useState } from "react";

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

import {

  SortableContext,

  rectSortingStrategy,

  sortableKeyboardCoordinates,

  useSortable,

  verticalListSortingStrategy,

} from "@dnd-kit/sortable";

import { CSS } from "@dnd-kit/utilities";

import type { WidgetType } from "@/hooks/use-window-manager";

import { normalizeWidgetAction } from "@/lib/os-assistant/widget-catalog";

import LauncherTile from "@/components/os/launcher/LauncherTile";

import {

  useLauncherConfig,

  useLauncherLongPress,

} from "@/components/os/launcher/LauncherConfigProvider";

import { splitIntoBalancedRows } from "@/lib/launcher/launcher-grid-layout";

import {

  buildQuickGridEditMatrix,

  computeQuickGridDimensions,

  getQuickGridExtents,

  getQuickGridViewExtents,

  parseQuickGridCellId,

  parseQuickGridDragId,

  quickGridCellId,

  quickGridDragId,

  quickGridInlineStyle,

  quickGridSlotsForView,

  quickGridSlotsInDisplayOrder,

  slotHasGridPosition,

  type GridCellCoord,

  type QuickGridCell,

} from "@/lib/launcher/quick-grid";

import type { LauncherSlot, LauncherZone } from "@/lib/launcher/user-launcher-config";

import {

  LAUNCHER_QUICK_EDIT_GRID_CLASS,

  LAUNCHER_QUICK_EDIT_SCROLL_CLASS,

  LAUNCHER_QUICK_GRID_CONTAINER_CLASS,

  LAUNCHER_QUICK_DESKTOP_WRAP_CLASS,

  LAUNCHER_QUICK_MOBILE_GRID_CLASS,

  LAUNCHER_QUICK_MOBILE_TILE_WRAPPER_CLASS,

  LAUNCHER_QUICK_ROW_CLASS,

  LAUNCHER_QUICK_TILE_WRAPPER_CLASS,

} from "@/lib/launcher/user-launcher-config";



type SortableLauncherZoneProps = {

  zone: LauncherZone;

  variant: "quick" | "sidebar" | "mobile";

  onOpen: (type: WidgetType) => void;

  className?: string;

};



function slotId(zone: LauncherZone, index: number) {

  return `${zone}-${index}`;

}



function useQuickGridCanvasSize(ref: React.RefObject<HTMLElement | null>) {

  const [size, setSize] = useState({ width: 1120, height: 560 });



  useEffect(() => {

    const el = ref.current;

    if (!el) return;



    const update = (width: number, height: number) => {

      if (width > 0 && height > 0) setSize({ width, height });

    };



    update(el.clientWidth, el.clientHeight);



    const ro = new ResizeObserver((entries) => {

      const rect = entries[0]?.contentRect;

      if (rect) update(rect.width, rect.height);

    });

    ro.observe(el);

    return () => ro.disconnect();

  }, [ref]);



  return useMemo(

    () => computeQuickGridDimensions(size.width, size.height),

    [size.width, size.height],

  );

}



function SortableSlot({

  zone,

  index,

  widgetId,

  variant,

  onOpen,

  disabled,

  gridCoord,

}: {

  zone: LauncherZone;

  index: number;

  widgetId: WidgetType | null;

  variant: "quick" | "sidebar" | "mobile";

  onOpen: (type: WidgetType) => void;

  disabled: boolean;

  gridCoord?: GridCellCoord;

}) {

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

            : undefined

      }

    >

      <LauncherTile

        zone={zone}

        slotIndex={index}

        gridCoord={gridCoord}

        widgetId={widgetId}

        onOpen={onOpen}

        variant={variant}

        isDragging={isDragging}

        dragHandleProps={disabled ? undefined : { ...attributes, ...listeners }}

      />

    </div>

  );

}



function QuickGridPositionView({

  zone,

  slots,

  onOpen,

}: {

  zone: LauncherZone;

  slots: LauncherSlot[];

  onOpen: (type: WidgetType) => void;

}) {

  const positioned = useMemo(() => quickGridSlotsForView(slots), [slots]);

  const viewExtents = useMemo(() => getQuickGridViewExtents(positioned), [positioned]);

  const gridStyle = useMemo(

    () => quickGridInlineStyle(viewExtents.cols, viewExtents.rows),

    [viewExtents.cols, viewExtents.rows],

  );



  return (

    <div className={LAUNCHER_QUICK_DESKTOP_WRAP_CLASS}>

      <div

        className="grid shrink-0 gap-3 [direction:ltr]"

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



function QuickGridMobileColumnView({

  zone,

  slots,

  onOpen,

}: {

  zone: LauncherZone;

  slots: LauncherSlot[];

  onOpen: (type: WidgetType) => void;

}) {

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

      className={`${LAUNCHER_QUICK_TILE_WRAPPER_CLASS} rounded-lg transition ${

        isOver ? "ring-2 ring-indigo-400/80 ring-offset-1 ring-offset-[color:var(--surface-main)]" : ""

      } ${isDragging ? "opacity-25" : ""}`}

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

        dragHandleProps={hasWidget ? { ...attributes, ...listeners } : undefined}

      />

    </div>

  );

}



function QuickGridEdit({

  zone,

  slots,

  onOpen,

  moveQuickGridCell,

  canvas,

}: {

  zone: LauncherZone;

  slots: LauncherSlot[];

  onOpen: (type: WidgetType) => void;

  moveQuickGridCell: (from: GridCellCoord, to: GridCellCoord) => void;

  canvas: { cols: number; rows: number };

}) {

  const matrix = useMemo(

    () => buildQuickGridEditMatrix(slots, true, canvas),

    [slots, canvas],

  );

  const totalRows = matrix.length;

  const totalCols = matrix[0]?.length ?? canvas.cols;

  const gridStyle = useMemo(

    () => quickGridInlineStyle(totalCols, totalRows),

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

      <div className={LAUNCHER_QUICK_EDIT_SCROLL_CLASS}>

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

          <div className={`${LAUNCHER_QUICK_TILE_WRAPPER_CLASS} scale-105 shadow-xl`}>

            <LauncherTile

              zone={zone}

              slotIndex={activeDrag.row * totalCols + activeDrag.col}

              gridCoord={{ row: activeDrag.row, col: activeDrag.col }}

              widgetId={activeDrag.widgetId}

              onOpen={onOpen}

              variant="quick"

              isDragging

            />

          </div>

        ) : null}

      </DragOverlay>

    </DndContext>

  );

}



export default function SortableLauncherZone({

  zone,

  variant,

  onOpen,

  className,

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

  const canvasRef = useRef<HTMLDivElement>(null);

  const canvas = useQuickGridCanvasSize(canvasRef);



  let items: React.ReactNode;

  if (isQuickGrid && editMode) {

    items = (

      <QuickGridEdit

        zone={zone}

        slots={slots}

        onOpen={onOpen}

        moveQuickGridCell={moveQuickGridCell}

        canvas={canvas}

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

    className:

      isQuickGrid

        ? [LAUNCHER_QUICK_GRID_CONTAINER_CLASS, className].filter(Boolean).join(" ")

        : className ?? "",

  };



  return (

    <div ref={isQuickGrid ? canvasRef : undefined} {...wrapperProps}>

      {inner}

    </div>

  );

}


