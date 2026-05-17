"use client";

import { useState, useRef, useEffect, useCallback } from 'react';

export type WidgetType = 'project' | 'cashflow' | 'aiChat' | 'crm' | 'dashboard' | 'erp' | 'quoteGen' | 'aiScanner' | 'projectBoard' | 'crmTable' | 'erpArchive' | 'docCreator' | 'aiChatFull' | 'settings' | 'meckanoReports' | 'googleDrive' | 'googleAssistant' | 'notebookLM' | 'accessibility' | 'platformAdmin' | 'helpCenter';

export interface ActiveWidget {
  id: string;
  type: WidgetType;
  liveData: Record<string, unknown> | null;
  position: { x: number; y: number };
  zIndex: number;
  size: { width: number; height: number };
  isMaximized?: boolean;
  zoom?: number;
}

const STORAGE_KEY = 'bsd_ybm_layout_quiet_v3';
const SNAPSHOT_KEY = 'bsd_ybm_layout_snapshot_session';

const DEFAULT_WIDGET_SIZES: Record<WidgetType, { width: number; height: number }> = {
  project: { width: 800, height: 600 },
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
  googleAssistant: { width: 500, height: 650 },
  notebookLM: { width: 720, height: 620 },
  accessibility: { width: 420, height: 560 },
  platformAdmin: { width: 1100, height: 780 },
  helpCenter: { width: 920, height: 720 },
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
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const restored = parsed.filter((w) => w && typeof w.id === 'string' && typeof w.type === 'string') as ActiveWidget[];
          setWidgets(restored);
          const maxZ = Math.max(...restored.map((w) => w.zIndex || 100), 100);
          nextZIndexRef.current = maxZ + 1;
          setIsFirstTime(false);
        }
      } else {
        setIsFirstTime(true);
      }
    } catch (e) {
      console.warn("LocalStorage load error:", e);
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

  const openWidget = useCallback((type: WidgetType, data: Record<string, unknown> | null = null) => {
    const id = `${type}-${Date.now()}`;
    const nextZ = nextZIndexRef.current + 1;
    nextZIndexRef.current = nextZ;
    
    const size = DEFAULT_WIDGET_SIZES[type] || { width: 750, height: 550 };
    
    // מרכוז החלון
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
    const width = Math.min(size.width, Math.max(360, viewportWidth - 32));
    const height = Math.min(size.height, Math.max(320, viewportHeight - 140));
    const x = viewportWidth / 2 - width / 2;
    const y = viewportHeight / 2 - height / 2;

    setWidgets(prev => [...prev, {
      id, type, liveData: data,
      position: { x: x + (prev.length * 20), y: y + (prev.length * 20) }, // Offset slightly for stack
      size: { width, height },
      zIndex: nextZ,
      zoom: 1
    }]);

    void import("@/lib/analytics/posthog-client").then(({ captureProductEvent }) => {
      captureProductEvent("widget_opened", { widget_type: type });
    });
  }, []);

  const toggleMaximize = useCallback((id: string) => {
    setWidgets(prev => prev.map(w => w.id === id ? { ...w, isMaximized: !w.isMaximized } : w));
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
    setWidgets(prev => prev.map(w => w.id === id ? { ...w, zIndex: nextZ } : w));
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
          console.warn('Snapshot restore failed:', e);
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

  return {
    widgets,
    hasHydrated,
    openWidget,
    closeWidget,
    focusWidget,
    updateWidgetPosition,
    updateWidgetSize,
    toggleMaximize,
    updateZoom,
    clearLayout,
    isFirstTime,
    isCleanDashboard,
    toggleWorkState,
  };
}
