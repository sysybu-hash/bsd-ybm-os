"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { MarketingPanelId } from "@/lib/marketing/marketing-panels";

type MarketingPanelContextValue = Readonly<{
  panel: MarketingPanelId | null;
  openPanel: (id: MarketingPanelId) => void;
  closePanel: () => void;
}>;

const MarketingPanelContext = createContext<MarketingPanelContextValue | null>(null);

export function MarketingPanelProvider({ children }: { children: React.ReactNode }) {
  const [panel, setPanel] = useState<MarketingPanelId | null>(null);

  const openPanel = useCallback((id: MarketingPanelId) => {
    setPanel(id);
  }, []);

  const closePanel = useCallback(() => {
    setPanel(null);
  }, []);

  const value = useMemo(
    () => ({ panel, openPanel, closePanel }),
    [panel, openPanel, closePanel],
  );

  return <MarketingPanelContext.Provider value={value}>{children}</MarketingPanelContext.Provider>;
}

export function useMarketingPanel(): MarketingPanelContextValue {
  const ctx = useContext(MarketingPanelContext);
  if (!ctx) {
    throw new Error("useMarketingPanel must be used within MarketingPanelProvider");
  }
  return ctx;
}
