"use client";

import React, { useState } from "react";
import { Check, X, Minus, Plus } from "lucide-react";
import { emitLogisticsMutation } from "@/lib/events/logistics-sync";
import { createLogger } from "@/lib/logger";

const log = createLogger("inline-quantity-editor");

interface InlineQuantityEditorProps {
  itemId: string;
  currentQuantity: number;
  unit: string;
  onUpdateComplete: (newQuantity: number) => void;
}

export default function InlineQuantityEditor({
  itemId,
  currentQuantity,
  unit,
  onUpdateComplete,
}: InlineQuantityEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState<number>(currentQuantity);
  const [isLoading, setIsLoading] = useState(false);

  const handleSave = async () => {
    if (value === currentQuantity) {
      setIsEditing(false);
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`/api/logistics/inventory/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: value }),
      });

      if (!res.ok) {
        throw new Error(`PATCH failed: ${res.status}`);
      }

      onUpdateComplete(value);
      setIsEditing(false);
      emitLogisticsMutation("inventory");
    } catch (err: unknown) {
      log.error("Failed to update quantity", {
        error: err instanceof Error ? err.message : String(err),
        itemId,
      });
      setValue(currentQuantity);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isEditing) {
    return (
      <button
        type="button"
        className="group flex items-center cursor-pointer p-1 -m-1 rounded hover:bg-surface-soft transition-colors text-start"
        onClick={() => setIsEditing(true)}
      >
        <span className="font-bold text-lg text-foreground-main">{currentQuantity}</span>
        <span className="text-foreground-muted ms-1">{unit}</span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => setValue((v) => Math.max(0, v - 1))}
        className="p-1 text-foreground-muted hover:text-foreground-main bg-surface-soft rounded"
        disabled={isLoading}
        aria-label="Decrease quantity"
      >
        <Minus className="w-4 h-4" />
      </button>

      <input
        type="number"
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        className="w-16 text-center bg-surface-card border border-border-strong rounded py-1 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-brand-accent [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        disabled={isLoading}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter") void handleSave();
          if (e.key === "Escape") {
            setIsEditing(false);
            setValue(currentQuantity);
          }
        }}
      />

      <button
        type="button"
        onClick={() => setValue((v) => v + 1)}
        className="p-1 text-foreground-muted hover:text-foreground-main bg-surface-soft rounded"
        disabled={isLoading}
        aria-label="Increase quantity"
      >
        <Plus className="w-4 h-4" />
      </button>

      <div className="flex flex-col ms-1 gap-0.5">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={isLoading}
          className="text-emerald-500 hover:opacity-80"
          aria-label="Save quantity"
        >
          <Check className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            setIsEditing(false);
            setValue(currentQuantity);
          }}
          disabled={isLoading}
          className="text-foreground-muted hover:opacity-80"
          aria-label="Cancel edit"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
