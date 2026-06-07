"use client";

import { useCallback, useState } from "react";
import type { WidgetType } from "@/hooks/use-window-manager";
import {
  readUtilityRailPrefs,
  writeUtilityRailPrefs,
  type CalcMode,
  type UtilityRailTab,
} from "@/lib/utility-rail/prefs";
import UtilityTabStrip from "./UtilityTabStrip";
import UtilityTabPanel from "./UtilityTabPanel";
import ZmanimUtilityPanel from "./panels/ZmanimUtilityPanel";
import CalculatorUtilityPanel from "./panels/CalculatorUtilityPanel";
import CurrencyConverterPanel from "./panels/CurrencyConverterPanel";

type Props = {
  openWidget: (type: WidgetType) => void;
  /** Hide tab strip on mobile while a widget is open — avoids blocking the close button. */
  suppressOnMobile?: boolean;
};

export default function WorkspaceUtilityRail({ openWidget, suppressOnMobile = false }: Props) {
  const [prefs] = useState(() => readUtilityRailPrefs());
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<UtilityRailTab | null>(null);
  const [calcMode, setCalcMode] = useState<CalcMode>(prefs.calcMode);

  const setPanelOpen = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) setActiveTab(null);
  }, []);

  const handleTabClick = useCallback(
    (tab: UtilityRailTab) => {
      if (open && activeTab === tab) {
        setPanelOpen(false);
        return;
      }
      setActiveTab(tab);
      setOpen(true);
      writeUtilityRailPrefs({ lastTab: tab });
    },
    [activeTab, open, setPanelOpen],
  );

  const handleOpenFullWidget = useCallback(
    (type: WidgetType) => {
      setPanelOpen(false);
      openWidget(type);
    },
    [openWidget, setPanelOpen],
  );

  const handleCalcModeChange = useCallback((mode: CalcMode) => {
    setCalcMode(mode);
    writeUtilityRailPrefs({ calcMode: mode });
  }, []);

  return (
    <div
      className={`os-utility-rail-host pointer-events-none fixed z-[1185] ${suppressOnMobile ? "max-md:hidden" : ""}`}
    >
      <div className="pointer-events-auto flex h-full flex-col items-center justify-center gap-1">
        <UtilityTabPanel open={open} activeTab={activeTab} onClose={() => setPanelOpen(false)}>
          {activeTab === "zmanim" ? (
            <ZmanimUtilityPanel onOpenFullWidget={() => handleOpenFullWidget("jewishCalendar")} />
          ) : null}
          {activeTab === "calculator" ? (
            <CalculatorUtilityPanel
              mode={calcMode}
              onModeChange={handleCalcModeChange}
              autoFocus={open}
            />
          ) : null}
          {activeTab === "currency" ? <CurrencyConverterPanel autoFocus={open} /> : null}
        </UtilityTabPanel>
        <UtilityTabStrip activeTab={activeTab} open={open} onTabClick={handleTabClick} />
      </div>
    </div>
  );
}
