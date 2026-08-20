"use client";

import React, { useState } from "react";
import { Calculator, Coins } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import type { CalcMode } from "@/lib/utility-rail/prefs";
import CalculatorUtilityPanel from "@/components/os/utility-rail/panels/CalculatorUtilityPanel";
import CurrencyConverterPanel from "@/components/os/utility-rail/panels/CurrencyConverterPanel";

const CARD =
  "rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-5 shadow-[var(--shadow-md)]";

export default function DashboardCalculators() {
  const { t } = useI18n();
  const [mode, setMode] = useState<CalcMode>("basic");

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <section className={CARD}>
        <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-[color:var(--foreground-main)]">
          <Calculator size={18} className="text-[color:var(--accent)]" aria-hidden />
          {t("workspaceWidgets.classicDashboard.calculators.calculator")}
        </h3>
        <CalculatorUtilityPanel mode={mode} onModeChange={setMode} />
      </section>

      <section className={CARD}>
        <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-[color:var(--foreground-main)]">
          <Coins size={18} className="text-[color:var(--accent)]" aria-hidden />
          {t("workspaceWidgets.classicDashboard.calculators.currency")}
        </h3>
        <CurrencyConverterPanel />
      </section>
    </div>
  );
}
