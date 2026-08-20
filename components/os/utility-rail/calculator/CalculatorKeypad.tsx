"use client";

import type { CalcMode } from "@/lib/utility-rail/prefs";

type KeyDef = {
  label: string;
  value: string;
  className?: string;
};

const BASIC_KEYS: KeyDef[][] = [
  [
    { label: "C", value: "C" },
    { label: "CE", value: "CE" },
    { label: "%", value: "%" },
    { label: "÷", value: "÷" },
  ],
  [
    { label: "7", value: "7" },
    { label: "8", value: "8" },
    { label: "9", value: "9" },
    { label: "×", value: "×" },
  ],
  [
    { label: "4", value: "4" },
    { label: "5", value: "5" },
    { label: "6", value: "6" },
    { label: "−", value: "-" },
  ],
  [
    { label: "1", value: "1" },
    { label: "2", value: "2" },
    { label: "3", value: "3" },
    { label: "+", value: "+" },
  ],
  [
    { label: "±", value: "±" },
    { label: "0", value: "0" },
    { label: ".", value: "." },
    { label: "=", value: "=", className: "bg-[color:var(--win-accent,#6366f1)] text-white hover:opacity-90" },
  ],
];

const SCIENTIFIC_ROW: KeyDef[] = [
  { label: "sin", value: "sin(" },
  { label: "cos", value: "cos(" },
  { label: "tan", value: "tan(" },
  { label: "log", value: "Math.log10(" },
  { label: "ln", value: "Math.log(" },
  { label: "√", value: "√(" },
  { label: "^", value: "^" },
  { label: "π", value: "π" },
  { label: "(", value: "(" },
  { label: ")", value: ")" },
];

type Props = {
  mode: CalcMode;
  onKey: (key: string) => void;
};

export default function CalculatorKeypad({ mode, onKey }: Props) {
  return (
    <div className="flex flex-col gap-1.5">
      {mode === "scientific" ? (
        <div className="grid grid-cols-5 gap-1">
          {SCIENTIFIC_ROW.map((key) => (
            <button
              key={key.label}
              type="button"
              onClick={() => onKey(key.value)}
              className="min-h-[40px] rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] text-xs font-semibold hover:bg-[color:var(--surface-soft)]"
            >
              {key.label}
            </button>
          ))}
        </div>
      ) : null}
      {BASIC_KEYS.map((row, i) => (
        <div key={i} className="grid grid-cols-4 gap-1">
          {row.map((key) => (
            <button
              key={key.label}
              type="button"
              onClick={() => onKey(key.value)}
              className={`min-h-[44px] rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] text-sm font-semibold hover:bg-[color:var(--surface-soft)] ${key.className ?? ""}`}
            >
              {key.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
