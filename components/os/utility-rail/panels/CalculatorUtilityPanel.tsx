"use client";

import { useCallback, useState } from "react";
import { useI18n } from "@/components/os/system/I18nProvider";
import { evalExpression, evalScientificExpression } from "@/lib/calculator/eval-expression";
import type { CalcMode } from "@/lib/utility-rail/prefs";
import CalculatorKeypad from "../calculator/CalculatorKeypad";

const R = "workspaceWidgets.utilityRail.calculator";

type Props = {
  mode: CalcMode;
  onModeChange: (mode: CalcMode) => void;
};

export default function CalculatorUtilityPanel({ mode, onModeChange }: Props) {
  const { t } = useI18n();
  const [expression, setExpression] = useState("");
  const [history, setHistory] = useState<string[]>([]);

  const evaluate = useCallback(
    (expr: string) => {
      const fn = mode === "scientific" ? evalScientificExpression : evalExpression;
      return fn(expr);
    },
    [mode],
  );

  const handleKey = useCallback(
    (key: string) => {
      if (key === "C") {
        setExpression("");
        return;
      }
      if (key === "CE") {
        setExpression((prev) => prev.slice(0, -1));
        return;
      }
      if (key === "±") {
        setExpression((prev) => {
          if (!prev) return "-";
          if (prev.startsWith("-")) return prev.slice(1);
          return `-${prev}`;
        });
        return;
      }
      if (key === "%") {
        setExpression((prev) => {
          const val = evaluate(prev);
          if (val == null) return prev;
          return String(val / 100);
        });
        return;
      }
      if (key === "=") {
        setExpression((prev) => {
          const val = evaluate(prev);
          if (val == null) return prev;
          const line = `${prev} = ${val}`;
          setHistory((h) => [line, ...h].slice(0, 3));
          return String(val);
        });
        return;
      }
      setExpression((prev) => prev + key);
    },
    [evaluate],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex rounded-lg border border-[color:var(--border-main)] p-0.5">
        <button
          type="button"
          onClick={() => onModeChange("basic")}
          className={`flex-1 rounded-md px-2 py-1.5 text-xs font-bold ${
            mode === "basic" ? "bg-indigo-600 text-white" : "text-[color:var(--foreground-muted)]"
          }`}
        >
          {t(`${R}.basic`)}
        </button>
        <button
          type="button"
          onClick={() => onModeChange("scientific")}
          className={`flex-1 rounded-md px-2 py-1.5 text-xs font-bold ${
            mode === "scientific" ? "bg-indigo-600 text-white" : "text-[color:var(--foreground-muted)]"
          }`}
        >
          {t(`${R}.scientific`)}
        </button>
      </div>

      <div
        className="rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-3 py-2 text-end font-mono text-xl font-bold tabular-nums break-all min-h-[3rem]"
        dir="ltr"
      >
        {expression || "0"}
      </div>

      {history.length > 0 ? (
        <div className="space-y-0.5 text-xs text-[color:var(--foreground-muted)]" dir="ltr">
          {history.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      ) : null}

      <CalculatorKeypad mode={mode} onKey={handleKey} />
    </div>
  );
}
