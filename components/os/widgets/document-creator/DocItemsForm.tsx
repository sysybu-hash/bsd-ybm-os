"use client";

import React from "react";
import { Plus, Trash2 } from "lucide-react";
import type { DocItem } from "./types";

type DocItemsFormProps = {
  items: DocItem[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, field: keyof DocItem, value: string | number) => void;
};

export function DocItemsForm({ items, onAdd, onRemove, onUpdate }: DocItemsFormProps) {
  return (
    <section>
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-[color:var(--background-main)]/50 flex items-center justify-center text-[10px] font-bold text-[color:var(--foreground-muted)] border border-[color:var(--border-main)]">
            2
          </div>
          <h3 className="text-sm font-bold text-[color:var(--foreground-muted)]">פירוט עבודה / פריטים</h3>
        </div>
        <button onClick={onAdd} className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 dark:hover:text-emerald-300 flex items-center gap-1 transition-colors">
          <Plus size={14} /> הוסף פריט
        </button>
      </div>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="flex gap-3 items-start group">
            <div className="flex-1 bg-[color:var(--background-main)]/30 border border-[color:var(--border-main)] rounded-xl p-3 flex flex-col md:flex-row gap-4 shadow-sm dark:shadow-none">
              <div className="flex-1">
                <input
                  placeholder="תיאור הפריט או העבודה..."
                  className="w-full bg-transparent border-none text-sm text-[color:var(--foreground-main)] focus:outline-none placeholder:text-[color:var(--foreground-muted)] opacity-80"
                  value={item.description}
                  onChange={(e) => onUpdate(item.id, "description", e.target.value)}
                />
              </div>
              <div className="w-full md:w-20 border-t md:border-t-0 md:border-r border-[color:var(--border-main)]/30 pt-2 md:pt-0 md:pr-4">
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="כמות"
                  className="w-full bg-transparent border-none text-sm text-center text-[color:var(--foreground-muted)] focus:outline-none"
                  value={item.quantity}
                  onChange={(e) => onUpdate(item.id, "quantity", parseFloat(e.target.value))}
                />
              </div>
              <div className="w-full md:w-32 border-t md:border-t-0 md:border-r border-[color:var(--border-main)]/30 pt-2 md:pt-0 md:pr-4 flex items-center gap-1">
                <span className="text-xs text-[color:var(--foreground-muted)]">₪</span>
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="מחיר"
                  className="w-full bg-transparent border-none text-sm text-left text-emerald-600 dark:text-emerald-400 font-bold focus:outline-none"
                  value={item.price}
                  onChange={(e) => onUpdate(item.id, "price", parseFloat(e.target.value))}
                />
              </div>
            </div>
            <button
              onClick={() => onRemove(item.id)}
              className="p-3 text-[color:var(--foreground-muted)] hover:text-red-600 dark:hover:text-red-400 transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
            >
              <Trash2 size={18} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
