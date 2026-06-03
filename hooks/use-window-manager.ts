"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  buildWidgetLayout,
  isMobileViewport,
  normalizeWidgetForViewport,
} from '@/lib/workspace/window-layout-policy';
import { computeProfessionalLayout } from '@/lib/workspace/screen-layout-generator';
import { readWorkspaceBounds } from '@/lib/workspace/workspace-bounds-registry';
import { normalizeWidgetAction } from '@/lib/os-assistant/widget-catalog';
import { resolveWidgetOpen } from '@/lib/os-assistant/resolve-widget-open';
import { createLogger } from '@/lib/logger';

const log = createLogger("window-manager");

export type WidgetType =
  | 'project'
  | 'cashflow'
  | 'aiChat'
  | 'crm'
  | 'dashboard'
  | 'erp'
  | 'quoteGen'
  | 'aiScanner'
  | 'projectBoard'
  | 'crmTable'
  | 'erpArchive'
  | 'docCreator'
  | 'aiChatFull'
  | 'settings'
  | 'meckanoReports'
  | 'googleDrive'
  | 'googleCalendar'
  | 'notebookLM'
  | 'accessibility'
  | 'platformAdmin'
  | 'helpCenter'
  | 'fieldCopilot'
  | 'financeHub'
  | 'projectsHub'
  | 'documentsHub'
  | 'aiHub'
  | 'appBuilder';

export interface ActiveWidget {
  id: string;
  type: WidgetType;
  liveData: Record<string, unknown> | null;
  position: { x: number; y: number };
  zIndex: number;
  size: { width: number; height: number };
  isMaximized?: boolean;
  isMinimized?: boolean;
  zoom?: number;
}

function migrateRestoredWidget(w: ActiveWidget): ActiveWidget {
  const rawType = String(w.type);
  const live =
    w.liveData && typeof w.liveData === 'object'
      ? (w.liveData as Record<string, unknown>)
      : null;
  const resolved = resolveWidgetOpen(rawType, live);
  const type = resolved?.type ?? normalizeWidgetAction(rawType);
  if (!type) return w;
  const mergedLive =
    resolved?.liveData != null
      ? { ...live, ...resolved.liveData }
      : live;
  return normalizeWidgetForViewport({
    ...w,
    type,
    liveData: mergedLive && Object.keys(mergedLive).length > 0 ? mergedLive : null,
  });
}

const STORAGE_KEY = 'bsd_ybm_layout_quiet_v6';
const PREVIOUS_STORAGE_KEY = 'bsd_ybm_layout_quiet_v5';
const LEGACY_STORAGE_KEY = 'bsd_ybm_layout_quiet_v3';
const SNAPSHOT_KEY = 'bsd_ybm_layout_snapshot_session';

const DEFAULT_WIDGET_SIZES: Record<WidgetType, { width: number; height: number }> = {
  project: { width: 1120, height: 780 },
  cashflow: { width: 900, height: 600 },
  aiChat: { width: 550, height: 650 },
  crm: { width: 850, height: 650 },
  dashboard: { width: 1000, height: 700 },
  erp: { width: 950, height: 700 },
  quoteGen: { width: 800, height: 750 },
  aiScanner: { width: 700, height: 600 },
  projectBoard: { width: 1100, height: 750 },
  crmTable: { width: 1100, height: 750 },
  erpArchive: { width: 1000, height: 750 },
  docCreator: { width: 850, height: 800 },
  aiChatFull: { width: 600, height: 750 },
  settings: { width: 600, height: 700 },
  meckanoReports: { width: 900, height: 750 },
  googleDrive: { width: 800, height: 600 },
  googleCalendar: { width: 900, height: 700 },
  notebookLM: { width: 720, height: 620 },
  accessibility: { width: 420, height: 560 },
  platformAdmin: { width: 1100, height: 780 },
  helpCenter: { width: 920, height: 720 },
  fieldCopilot: { width: 920, height: 820 },
  financeHub: { width: 1040, height: 780 },
  projectsHub: { width: 1120, height: 780 },
  documentsHub: { width: 1040, height: 780 },
  aiHub: { width: 720, height: 750 },
  appBuilder: { width: 1100, height: 780 },
};

export function useWindowManager() {
  const [widgets, setWidgets] = useState<ActiveWidget[]>([]);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [isFirstTime, setIsFirstTime] = useState(false);
  const [isCleanDashboard, setIsCleanDashboard] = useState(false);
  const nextZIndexRef = useRef(100);

  // Persistence: Load
  useEffect(() => {
    try {
      let raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        raw = localStorage.getItem(PREVIOUS_STORAGE_KEY);
        if (raw) localStorage.removeItem(PREVIOUS_STORAGE_KEY);
      }
      if (!raw) {
        const v4 = localStorage.getItem('bsd_ybm_layout_quiet_v4');
        if (v4) {
          raw = v4;
          localStorage.removeItem('bsd_ybm_layout_quiet_v4');
        }
      }
      if (!raw) {
        const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (legacy) {
          raw = legacy;
          localStorage.removeItem(LEGACY_STORAGE_KEY);
        }
      }
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const restored = parsed
            .filter(
              (w) =>
                w &&
                typeof w.id === 'string' &&
                typeof w.type === 'string' &&
                normalizeWidgetAction(w.type),
            )
            .map((w) => migrateRestoredWidget(w as ActiveWidget)) as ActiveWidget[];
          setWidgets(restored);
          const maxZ = Math.max(...restored.map((w) => w.zIndex || 100), 100);
          nextZIndexRef.current = maxZ + 1;
          setIsFirstTime(false);
        }
      } else {
        setIsFirstTime(true);
      }
    } catch (e) {
      log.warn("localStorage load error", { error: e instanceof Error ? e.message : String(e) });
      setIsFirstTime(true);
    } finally {
      setHasHydrated(true);
    }
  }, []);

  // Persistence: Save
  useEffect(() => {
    if (hasHydrated) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
    }
  }, [widgets, hasHydrated]);

  const openWidget = useCallback((type: WidgetType, data: Record<string, unknown> | null = null): string => {
    const resolved = resolveWidgetOpen(type, data);
    if (!resolved) return '';
    const { type: openType, liveData } = resolved;

    const id = `${openType}-${Date.now()}`;
    const nextZ = nextZIndexRef.current + 1;
    nextZIndexRef.current = nextZ;

    const defaultSize = DEFAULT_WIDGET_SIZES[openType] || { width: 750, height: 550 };
    const mobile = typeof window !== 'undefined' && isMobileViewport();

    setWidgets((prev) => {
      const stackIndex = mobile ? 0 : prev.length;
      const layout = buildWidgetLayout(openType, defaultSize, stackIndex);
      // אם כבר עובדים על חלון במצב מלא — החלון החדש נפתח גם הוא ממוקסם
      // וממוקם אחרון (סדר DOM) כך שיופיע מעל החלון המלא הקיים במקום להיחבא מאחוריו.
      const anyMaximized = !mobile && prev.some((w) => w.isMaximized && !w.isMinimized);
      const next: ActiveWidget = {
        id,
        type: openType,
        liveData,
        position: layout.position,
        size: layout.size,
        zIndex: nextZ,
        zoom: 1,
        isMaximized: layout.isMaximized || anyMaximized,
      };
      if (mobile) {
        return [next];
      }
      return [...prev, next];
    });

    void import("@/lib/analytics/workspace-events").then(({ trackWidgetOpened }) => {
      trackWidgetOpened(openType, { source: "launcher", mobile });
    });
    return id;
  }, []);

  const toggleMinimize = useCallback((id: string) => {
    setWidgets((prev) => {
      const target = prev.find((w) => w.id === id);
      if (!target) return prev;
      const willMinimize = !target.isMinimized;
      return prev.map((w) => {
        if (w.id !== id) return w;
        if (willMinimize) {
          return { ...w, isMinimized: true, isMaximized: false };
        }
        const nextZ = nextZIndexRef.current + 1;
        nextZIndexRef.current = nextZ;
        return { ...w, isMinimized: false, zIndex: nextZ };
      });
    });
  }, []);

  const restoreWidget = useCallback((id: string) => {
    const nextZ = nextZIndexRef.current + 1;
    nextZIndexRef.current = nextZ;
    setWidgets((prev) =>
      prev.map((w) =>
        w.id === id ? { ...w, isMinimized: false, zIndex: nextZ } : w,
      ),
    );
  }, []);

  const toggleMaximize = useCallback((id: string) => {
    setWidgets((prev) => {
      const target = prev.find((w) => w.id === id);
      if (!target) return prev;
      const willMaximize = !target.isMaximized;
      if (!willMaximize) {
        return prev.map((w) => (w.id === id ? { ...w, isMaximized: false } : w));
      }
      const nextZ = nextZIndexRef.current + 1;
      nextZIndexRef.current = nextZ;
      return prev.map((w) =>
        w.id === id ? { ...w, isMaximized: true, zIndex: nextZ } : w,
      );
    });
  }, []);

  const updateZoom = useCallback((id: string, delta: number) => {
    setWidgets(prev => prev.map(w => w.id === id ? { ...w, zoom: Math.max(0.5, Math.min(2, (w.zoom || 1) + delta)) } : w));
  }, []);

  const closeWidget = useCallback((id: string) => {
    setWidgets(prev => prev.filter(w => w.id !== id));
  }, []);

  const focusWidget = useCallback((id: string) => {
    const nextZ = nextZIndexRef.current + 1;
    nextZIndexRef.current = nextZ;
    setWidgets((prev) =>
      prev.map((w) =>
        w.id === id ? { ...w, zIndex: nextZ, isMinimized: false } : w,
      ),
    );
  }, []);

  const updateWidgetPosition = useCallback((id: string, position: { x: number; y: number }) => {
    setWidgets(prev => prev.map(w => w.id === id ? { ...w, position } : w));
  }, []);

  const updateWidgetSize = useCallback((id: string, size: { width: number; height: number }) => {
    setWidgets(prev => prev.map(w => w.id === id ? { ...w, size } : w));
  }, []);

  const clearLayout = useCallback(() => {
    setWidgets([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const enterCleanDashboard = useCallback(() => {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify(widgets));
    }
    setWidgets([]);
    setIsCleanDashboard(true);
  }, [widgets]);

  const restoreWorkSnapshot = useCallback(() => {
    if (typeof sessionStorage !== 'undefined') {
      const raw = sessionStorage.getItem(SNAPSHOT_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as ActiveWidget[];
          if (Array.isArray(parsed)) {
            setWidgets(parsed.filter((w) => w && typeof w.id === 'string'));
            const maxZ = Math.max(...parsed.map((w) => w.zIndex || 100), 100);
            nextZIndexRef.current = maxZ + 1;
          }
        } catch (e) {
          log.warn("snapshot restore failed", { error: e instanceof Error ? e.message : String(e) });
        }
        sessionStorage.removeItem(SNAPSHOT_KEY);
      }
    }
    setIsCleanDashboard(false);
  }, []);

  const toggleWorkState = useCallback(() => {
    if (isCleanDashboard) {
      restoreWorkSnapshot();
    } else {
      enterCleanDashboard();
    }
  }, [isCleanDashboard, enterCleanDashboard, restoreWorkSnapshot]);

  const applyProfessionalLayout = useCallback(() => {
    if (typeof window === 'undefined' || isMobileViewport()) return;
    const workspace = readWorkspaceBounds();
    setWidgets((prev) => {
      if (prev.length === 0) return prev;
      const sorted = [...prev].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
      const layouts = computeProfessionalLayout(
        sorted.map((w) => ({ id: w.id })),
        workspace,
      );
      let z = 100;
      const zById = new Map<string, number>();
      for (const w of sorted) {
        z += 1;
        zById.set(w.id, z);
      }
      nextZIndexRef.current = z + 1;
      return prev.map((w) => {
        const cell = layouts.get(w.id);
        const nextZ = zById.get(w.id) ?? w.zIndex;
        if (!cell) {
          return { ...w, isMaximized: false, zIndex: nextZ };
        }
        return {
          ...w,
          position: cell.position,
          size: cell.size,
          isMaximized: false,
          zIndex: nextZ,
        };
      });
    });
  }, []);

  const openWidgetFocused = useCallback(
    (
      type: WidgetType,
      data: Record<string, unknown> | null = null,
      options?: { maximize?: boolean },
    ) => {
      const id = openWidget(type, data);
      const shouldMaximize =
        options?.maximize ?? (typeof window !== 'undefined' && isMobileViewport());
      window.setTimeout(() => {
        focusWidget(id);
        // השמה אידמפוטנטית (לא toggle) — אחרת אם openWidget כבר מיקסם את החלון
        // (כי כבר עבדו על חלון מלא), ה-toggle היה מבטל את המיקסום ומחביא אותו.
        if (shouldMaximize) {
          setWidgets((prev) => prev.map((w) => (w.id === id ? { ...w, isMaximized: true } : w)));
        }
      }, 0);
      return id;
    },
    [openWidget, focusWidget],
  );

  return {
    widgets,
    hasHydrated,
    openWidget,
    openWidgetFocused,
    closeWidget,
    focusWidget,
    updateWidgetPosition,
    updateWidgetSize,
    toggleMaximize,
    toggleMinimize,
    restoreWidget,
    updateZoom,
    clearLayout,
    isFirstTime,
    isCleanDashboard,
    toggleWorkState,
    applyProfessionalLayout,
  };
}
