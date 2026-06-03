"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type { LineItemV5 } from "@/lib/scan-schema-v5";
import { useI18n } from "@/components/os/system/I18nProvider";

// ── Sortable row ──────────────────────────────────────────────────────────────

type SortableRowProps = {
  id: string;
  row: LineItemV5;
  onUpdate: (patch: Partial<LineItemV5>) => void;
  onRemove: () => void;
};

function SortableRow({ id, row, onUpdate, onRemove }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`border-b border-[color:var(--border-main)]/50 ${isDragging ? "opacity-50" : ""}`}
    >
      {/* Drag handle */}
      <td className="w-6 p-1">
        <button
          type="button"
          className="cursor-grab touch-none text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)]"
          aria-label="גרור לסידור מחדש"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={14} />
        </button>
      </td>

      <td className="p-2">
        <input
          className="w-full rounded border border-[color:var(--border-main)] px-2 py-1"
          value={row.description}
          onChange={(e) => onUpdate({ description: e.target.value })}
        />
      </td>
      <td className="p-2">
        <input
          type="number"
          min={0}
          className="w-full rounded border border-[color:var(--border-main)] px-2 py-1"
          value={row.quantity ?? 1}
          onChange={(e) => onUpdate({ quantity: Number(e.target.value) || 0 })}
        />
      </td>
      <td className="p-2">
        <input
          type="number"
          min={0}
          step="0.01"
          className={`w-full rounded border px-2 py-1 ${
            (row.unitPrice ?? 0) <= 0 ? "border-amber-500 bg-amber-500/10" : "border-[color:var(--border-main)]"
          }`}
          value={row.unitPrice ?? 0}
          onChange={(e) => onUpdate({ unitPrice: Number(e.target.value) || 0 })}
        />
      </td>
      <td className="p-2">
        <button type="button" onClick={onRemove} className="text-rose-600 text-xs font-bold">
          ×
        </button>
      </td>
    </tr>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type Props = {
  rows: LineItemV5[];
  onChange: (rows: LineItemV5[]) => void;
};

export default function BoqReviewTable({ rows, onChange }: Props) {
  const { t } = useI18n();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = rows.findIndex((_, i) => String(i) === active.id);
      const newIndex = rows.findIndex((_, i) => String(i) === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        onChange(arrayMove(rows, oldIndex, newIndex));
      }
    }
  };

  const updateRow = (idx: number, patch: Partial<LineItemV5>) => {
    onChange(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const addRow = () => {
    onChange([...rows, { description: "", quantity: 1, unitPrice: 0 }]);
  };

  const removeRow = (idx: number) => {
    onChange(rows.filter((_, i) => i !== idx));
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-[color:var(--border-main)]">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={rows.map((_, i) => String(i))} strategy={verticalListSortingStrategy}>
          <table className="w-full min-w-[540px] text-sm">
            <thead>
              <tr className="border-b bg-[color:var(--surface-soft)] text-start text-xs">
                <th className="w-6 p-2" aria-label="גרור" />
                <th className="p-2">{t("workspaceWidgets.fieldCopilot.colDescription")}</th>
                <th className="p-2 w-20">{t("workspaceWidgets.fieldCopilot.colQty")}</th>
                <th className="p-2 w-24">{t("workspaceWidgets.fieldCopilot.colPrice")}</th>
                <th className="p-2 w-10" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <SortableRow
                  key={idx}
                  id={String(idx)}
                  row={row}
                  onUpdate={(patch) => updateRow(idx, patch)}
                  onRemove={() => removeRow(idx)}
                />
              ))}
            </tbody>
          </table>
        </SortableContext>
      </DndContext>
      <button type="button" onClick={addRow} className="w-full py-2 text-xs font-bold text-sky-600">
        + {t("workspaceWidgets.fieldCopilot.addRow")}
      </button>
    </div>
  );
}
