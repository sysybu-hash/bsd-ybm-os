"use client";

import { useState, useRef, useEffect, useCallback } from 'react';

export type WidgetType = 'project' | 'cashflow' | 'aiChat' | 'crm' | 'dashboard' | 'erp' | 'quoteGen' | 'aiScanner' | 'projectBoard' | 'crmTable' | 'erpArchive' | 'docCreator' | 'aiChatFull' | 'settings' | 'meckanoReports';

export interface ActiveWidget {
  id: string;
  type: WidgetType;
  liveData: any;
  position: { x: number; y: number };
  zIndex: number;
  size: { width: number; height: number };
  isMaximized?: boolean;
  zoom?: number;
}

const STORAGE_KEY = 'bsd_ybm_layout_final_v2';

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
};

export function useWindowManager() {
  const [widgets, setWidgets] = useState<ActiveWidget[]>([]);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [isFirstTime, setIsFirstTime] = useState(false);
  const nextZIndexRef = useRef(100);

  // Persistence: Load
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setWidgets(parsed);
          const maxZ = Math.max(...parsed.map((w: any) => w.zIndex || 100), 100);
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

  const openWidget = useCallback((type: WidgetType, data: any = null) => {
    const id = `${type}-${Date.now()}`;
    const nextZ = nextZIndexRef.current + 1;
    nextZIndexRef.current = nextZ;
    
    const size = DEFAULT_WIDGET_SIZES[type] || { width: 750, height: 550 };
    
    // מרכוז החלון
    const x = typeof window !== 'undefined' ? (window.innerWidth / 2 - size.width / 2) : 100;
    const y = typeof window !== 'undefined' ? (window.innerHeight / 2 - size.height / 2) : 100;

    setWidgets(prev => [...prev, {
      id, type, liveData: data,
      position: { x: x + (prev.length * 20), y: y + (prev.length * 20) }, // Offset slightly for stack
      size,
      zIndex: nextZ,
      zoom: 1
    }]);
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
    isFirstTime
  };
}
