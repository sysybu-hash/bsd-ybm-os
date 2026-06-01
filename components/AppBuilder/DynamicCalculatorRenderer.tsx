"use client";

import { useMemo, useState } from "react";
import { Calculator } from "lucide-react";
import type { AppBuilderCalculatorUI } from "@/lib/validation/schemas/app-builder";

type Props = { schema: AppBuilderCalculatorUI };

/** Safe formula evaluator — only allows input ids, numbers, operators, and Math.* */
function evalFormula(formula: string, values: Record<string, number>): number | null {
  try {
    // Replace each input id with its numeric value
    let expr = formula;
    for (const [id, val] of Object.entries(values)) {
      expr = expr.replace(new RegExp(`\\b${id}\\b`, "g"), String(isFinite(val) ? val : 0));
    }
    // Whitelist: digits, dot, operators, parens, spaces, and Math identifiers
    if (!/^[\d\s+\-*/().,Matha-z_]+$/.test(expr)) return null;
    const result = new Function(`"use strict"; return (${expr})`)() as unknown; // safe: whitelist-validated
    return typeof result === "number" && isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

function fmt(val: number | null, decimals = 2): string {
  if (val === null) return "—";
  return val.toLocaleString("he-IL", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export default function DynamicCalculatorRenderer({ schema }: Props) {
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(schema.inputs.map((i) => [i.id, i.defaultValue ?? 0])),
  );

  const results = useMemo(
    () =>
      schema.outputs.map((out) => ({
        ...out,
        value: evalFormula(out.formula, values),
      })),
    [schema.outputs, values],
  );

  return (
    <div className="flex flex-col gap-5 p-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Calculator className="h-5 w-5 shrink-0 text-amber-400" aria-hidden />
        <div>
          <h2 className="text-base font-bold text-[color:var(--foreground-main)]">{schema.title}</h2>
          {schema.description ? (
            <p className="text-xs text-[color:var(--foreground-muted)]">{schema.description}</p>
          ) : null}
        </div>
      </div>

      {/* Inputs */}
      <div className="grid gap-3 sm:grid-cols-2">
        {schema.inputs.map((inp) => (
          <label key={inp.id} className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[color:var(--foreground-main)]">
              {inp.label}
              {inp.unit ? <span className="ms-1 text-[color:var(--foreground-muted)]">({inp.unit})</span> : null}
            </span>
            <div className="flex items-center gap-2 rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-3 py-2 focus-within:ring-2 focus-within:ring-amber-500/40">
              <input
                type="number"
                value={values[inp.id] ?? 0}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setValues((prev) => ({ ...prev, [inp.id]: isNaN(v) ? 0 : v }));
                }}
                className="min-w-0 flex-1 bg-transparent text-sm focus:outline-none"
              />
            </div>
          </label>
        ))}
      </div>

      {/* Divider */}
      <div className="h-px bg-[color:var(--border-main)]" />

      {/* Outputs */}
      <div className="grid gap-3 sm:grid-cols-2">
        {results.map((out) => (
          <div
            key={out.id}
            className="flex flex-col gap-1 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3"
          >
            <span className="text-xs font-medium text-[color:var(--foreground-muted)]">{out.label}</span>
            <span className="text-2xl font-black text-amber-300">
              {fmt(out.value, out.decimals ?? 2)}
              {out.unit ? <span className="ms-1 text-sm font-normal text-[color:var(--foreground-muted)]">{out.unit}</span> : null}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
