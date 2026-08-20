"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import OsBootSplash, {
  type OsBootPhase,
} from "@/components/os/boot/OsBootSplash";
import { useOsBootGate } from "@/components/os/boot/useOsBootGate";

export type OsBootReport = {
  mounted: boolean;
  sessionBlocking: boolean;
  hasHydrated: boolean;
  launcherBootReady: boolean;
};

type OsBootContextValue = {
  reportBoot: (partial: Partial<OsBootReport>) => void;
  showSplash: boolean;
  blockPointer: boolean;
};

const OsBootContext = createContext<OsBootContextValue | null>(null);

const INITIAL: OsBootReport = {
  mounted: false,
  sessionBlocking: true,
  hasHydrated: false,
  launcherBootReady: false,
};

/**
 * Persistent boot overlay for the workspace segment.
 * Lives in layout so route `loading.tsx` ↔ page swaps and dynamic chunk
 * loads never remount/unmount the splash (that was the visible jump).
 */
export function OsBootHost({ children }: { children: React.ReactNode }) {
  const [report, setReport] = useState<OsBootReport>(INITIAL);

  const reportBoot = useCallback((partial: Partial<OsBootReport>) => {
    setReport((prev) => {
      const next = { ...prev, ...partial };
      if (
        next.mounted === prev.mounted &&
        next.sessionBlocking === prev.sessionBlocking &&
        next.hasHydrated === prev.hasHydrated &&
        next.launcherBootReady === prev.launcherBootReady
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  const { showSplash, fading, phase, blockPointer } = useOsBootGate(report);

  useEffect(() => {
    const root = document.documentElement;
    if (showSplash) {
      root.setAttribute("data-os-boot", "1");
      return;
    }
    root.removeAttribute("data-os-boot");
  }, [showSplash]);

  const value = useMemo(
    () => ({ reportBoot, showSplash, blockPointer }),
    [reportBoot, showSplash, blockPointer],
  );

  return (
    <OsBootContext.Provider value={value}>
      {showSplash ? (
        <OsBootSplash phase={phase as OsBootPhase} fading={fading} />
      ) : null}
      {children}
    </OsBootContext.Provider>
  );
}

export function useOsBootReport(): OsBootContextValue {
  const ctx = useContext(OsBootContext);
  if (!ctx) {
    return {
      reportBoot: () => {},
      showSplash: false,
      blockPointer: false,
    };
  }
  return ctx;
}
