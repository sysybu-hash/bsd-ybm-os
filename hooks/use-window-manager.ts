"use client";

import { useState, useRef, useEffect, useCallback, type MutableRefObject } from 'react';
import {
  buildWidgetLayout,
  clampWidgetLayoutToWorkspace,
  isMobileViewport,
} from '@/lib/workspace/window-layout-policy';
import { computeProfessionalLayout } from '@/lib/workspace/screen-layout-generator';
import { readWorkspaceBounds } from '@/lib/workspace/workspace-bounds-registry';
import { normalizeWidgetAction } from '@/lib/os-assistant/widget-catalog';
import { resolveWidgetOpen } from '@/lib/os-assistant/resolve-widget-open';
import {
  LEGACY_GLOBAL_LAYOUT_KEY,
  parseWorkspaceLayoutFromStorage,
  scrubWorkspaceLayout,
  workspaceLayoutStorageKey,
} from '@/lib/workspace/user-workspace-layout';
import {
  isApiCooldown,
  markApiCooldownFromResponse,
} from '@/lib/client/api-rate-limit-backoff';
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
  | 'jewishCalendar'
  | 'notebookLM'
  | 'accessibility'
  | 'platformAdmin'
  | 'helpCenter'
  | 'fieldCopilot'
  | 'financeHub'
  | 'projectsHub'
  | 'documentsHub'
  | 'aiHub'
  | 'appBuilder'
  | 'logisticsHub'
  | 'procurementHub'
  | 'executiveHub'
  | 'universalCommand';

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
  const migrated: ActiveWidget = {
    ...w,
    type,
    liveData: mergedLive && Object.keys(mergedLive).length > 0 ? mergedLive : null,
  };
  // Keep saved desktop coordinates in memory on mobile — shell renders fullscreen locally.
  if (typeof window !== 'undefined' && isMobileViewport()) return migrated;
  return clampWidgetLayoutToWorkspace(migrated);
}

function canPersistWorkspaceLayout(): boolean {
  return typeof window !== 'undefined' && !isMobileViewport();
}

const LEGACY_STORAGE_KEYS = [
  LEGACY_GLOBAL_LAYOUT_KEY,
  'bsd_ybm_layout_quiet_v5',
  'bsd_ybm_layout_quiet_v4',
  'bsd_ybm_layout_quiet_v3',
] as const;
const SNAPSHOT_KEY = 'bsd_ybm_layout_snapshot_session';
const WORKSPACE_LAYOUT_API_KEY = 'api:user/workspace-layout';

/**
 * Cross-tab sync channel name — without this, two open tabs of the same user
 * each hold their own in-memory `widgets` copy with no coordination. A stale
 * background tab can later re-save its old state and clobber a fresh close
 * made in another tab (last-write-wins, no version check). BroadcastChannel
 * lets every open tab adopt a change the instant another tab makes it.
 */
function workspaceLayoutChannelName(userId: string): string {
  return `bsd_ybm_workspace_layout:${userId}`;
}

type WorkspaceLayoutBroadcastMessage = { widgets: ActiveWidget[]; ts: number };

function removeLegacyGlobalLayoutKeys(): void {
  for (const key of LEGACY_STORAGE_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch { /* quota */ }
  }
}

function applyRestoredWidgets(
  widgets: ActiveWidget[],
  setWidgets: (w: ActiveWidget[]) => void,
  nextZIndexRef: MutableRefObject<number>,
): void {
  const restored = widgets.map((w) => migrateRestoredWidget(w));
  setWidgets(restored);
  const maxZ = Math.max(...restored.map((w) => w.zIndex || 100), 100);
  nextZIndexRef.current = maxZ + 1;
}

type UseWindowManagerOptions = {
  userId: string | null;
  authReady: boolean;
};

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
  jewishCalendar: { width: 520, height: 720 },
  notebookLM: { width: 720, height: 620 },
  accessibility: { width: 420, height: 560 },
  platformAdmin: { width: 1100, height: 780 },
  helpCenter: { width: 920, height: 720 },
  fieldCopilot: { width: 920, height: 820 },
  financeHub: { width: 1040, height: 780 },
  projectsHub: { width: 1120, height: 780 },
  documentsHub: { width: 1040, height: 780 },
  aiHub: { width: 1100, height: 780 },
  appBuilder: { width: 1100, height: 780 },
  logisticsHub: { width: 1040, height: 780 },
  procurementHub: { width: 1040, height: 780 },
  executiveHub: { width: 1080, height: 800 },
  universalCommand: { width: 920, height: 640 },
};

// True after the first successful server-sync in this browser session.
// Prevents stale-localStorage flash on first page load while preserving
// instant layout restore during in-session user switches.
let _sessionServerSynced = false;

export function useWindowManager({ userId, authReady }: UseWindowManagerOptions) {
  const [widgets, setWidgets] = useState<ActiveWidget[]>([]);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [isFirstTime, setIsFirstTime] = useState(false);
  const [isCleanDashboard, setIsCleanDashboard] = useState(false);
  const nextZIndexRef = useRef(100);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeUserIdRef = useRef<string | null>(null);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  /** True for exactly one save-effect run right after adopting another tab's
   *  broadcast — skips re-broadcasting/re-PATCHing an unchanged echo. */
  const applyingRemoteUpdateRef = useRef(false);

  // (Re)open the cross-tab channel whenever the active user changes.
  useEffect(() => {
    if (!userId || typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
      return;
    }
    const channel = new BroadcastChannel(workspaceLayoutChannelName(userId));
    broadcastChannelRef.current = channel;
    channel.onmessage = (event: MessageEvent<WorkspaceLayoutBroadcastMessage>) => {
      const data = event.data;
      if (!data || !Array.isArray(data.widgets)) return;
      applyingRemoteUpdateRef.current = true;
      applyRestoredWidgets(data.widgets, setWidgets, nextZIndexRef);
    };
    return () => {
      channel.close();
      if (broadcastChannelRef.current === channel) broadcastChannelRef.current = null;
    };
  }, [userId]);

  const persistLayout = useCallback((
    nextWidgets: ActiveWidget[],
    targetUserId: string,
    options?: { force?: boolean },
  ) => {
    if (!options?.force && !canPersistWorkspaceLayout()) return;
    const sanitized = scrubWorkspaceLayout(nextWidgets);
    const storageKey = workspaceLayoutStorageKey(targetUserId);
    try {
      broadcastChannelRef.current?.postMessage({ widgets: sanitized, ts: Date.now() } satisfies WorkspaceLayoutBroadcastMessage);
    } catch {
      /* BroadcastChannel unsupported or already closed — server sync below still applies */
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify(sanitized));
    } catch (e) {
      log.warn("localStorage save error", { error: e instanceof Error ? e.message : String(e) });
    }
    if (isApiCooldown(WORKSPACE_LAYOUT_API_KEY)) return;
    void fetch("/api/user/workspace-layout", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ widgets: sanitized }),
    })
      .then((res) => {
        markApiCooldownFromResponse(WORKSPACE_LAYOUT_API_KEY, res);
      })
      .catch(() => { /* network */ });
  }, []);

  // Persistence: load per user (server + user-scoped localStorage)
  useEffect(() => {
    if (!authReady) return;

    if (!userId) {
      setWidgets([]);
      setIsFirstTime(true);
      setHasHydrated(true);
      activeUserIdRef.current = null;
      return;
    }

    let cancelled = false;
    activeUserIdRef.current = userId;
    const layoutUserId = userId;

    const storageKey = workspaceLayoutStorageKey(layoutUserId);
    let localWidgets = parseWorkspaceLayoutFromStorage(
      typeof window !== "undefined" ? localStorage.getItem(storageKey) : null,
    );
    if (localWidgets.length === 0) {
      const legacyRaw =
        typeof window !== "undefined" ? localStorage.getItem(LEGACY_GLOBAL_LAYOUT_KEY) : null;
      localWidgets = parseWorkspaceLayoutFromStorage(legacyRaw);
    }

    // Phase 1 (sync): apply cached layout into state.
    // On first page load (_sessionServerSynced=false) we intentionally do NOT mark
    // hasHydrated yet — this prevents a stale-localStorage flash where an old widget
    // flickers before Phase 2 overwrites it with the real server layout.
    // On subsequent in-session user switches Phase 1 fires after _sessionServerSynced
    // is already true, so we restore instantly as before.
    if (localWidgets.length > 0) {
      applyRestoredWidgets(localWidgets, setWidgets, nextZIndexRef);
      setIsFirstTime(false);
    } else {
      setWidgets([]);
      setIsFirstTime(true);
    }
    if (_sessionServerSynced) {
      setHasHydrated(true);
    }

    // Phase 2 (async): reconcile with server in background
    async function syncFromServer() {
      let resolvedWidgets: ActiveWidget[] = localWidgets;
      let firstTime = localWidgets.length === 0;

      try {
        if (!isApiCooldown(WORKSPACE_LAYOUT_API_KEY)) {
          const res = await fetch("/api/user/workspace-layout", { credentials: "include" });
          if (markApiCooldownFromResponse(WORKSPACE_LAYOUT_API_KEY, res)) {
            resolvedWidgets = localWidgets;
            firstTime = resolvedWidgets.length === 0;
          } else if (res.ok) {
            const data = (await res.json()) as { widgets?: unknown };
            const serverWidgets = scrubWorkspaceLayout(data.widgets ?? null);
            if (serverWidgets.length > 0) {
              resolvedWidgets = serverWidgets;
              firstTime = false;
              try {
                localStorage.setItem(storageKey, JSON.stringify(serverWidgets));
              } catch { /* quota */ }
            } else if (localWidgets.length > 0) {
              resolvedWidgets = localWidgets;
              firstTime = false;
              persistLayout(localWidgets, layoutUserId, { force: true });
            } else {
              const legacyRaw =
                typeof window !== "undefined" ? localStorage.getItem(LEGACY_GLOBAL_LAYOUT_KEY) : null;
              const legacyWidgets = parseWorkspaceLayoutFromStorage(legacyRaw);
              if (legacyWidgets.length > 0) {
                resolvedWidgets = legacyWidgets;
                firstTime = false;
                persistLayout(legacyWidgets, layoutUserId, { force: true });
              }
              removeLegacyGlobalLayoutKeys();
            }
          } else if (localWidgets.length > 0) {
            resolvedWidgets = localWidgets;
            firstTime = false;
          }
        } else if (localWidgets.length > 0) {
          resolvedWidgets = localWidgets;
          firstTime = false;
        }
      } catch (e) {
        log.warn("workspace layout hydrate error", {
          error: e instanceof Error ? e.message : String(e),
        });
        if (localWidgets.length > 0) {
          resolvedWidgets = localWidgets;
          firstTime = false;
        }
      }

      if (cancelled || activeUserIdRef.current !== layoutUserId) return;

      if (resolvedWidgets.length > 0) {
        applyRestoredWidgets(resolvedWidgets, setWidgets, nextZIndexRef);
        setIsFirstTime(false);
      } else {
        setWidgets([]);
        setIsFirstTime(firstTime);
      }
      // Mark session as synced — subsequent in-session user switches can use Phase 1
      // instant restore without risk of flashing stale data on cold page load.
      _sessionServerSynced = true;
      setHasHydrated(true);
    }

    void syncFromServer();
    return () => {
      cancelled = true;
    };
  }, [authReady, userId, persistLayout]);

  // Persistence: save per user (debounced server sync) — desktop only
  useEffect(() => {
    if (!hasHydrated || !userId || activeUserIdRef.current !== userId) return;
    if (!canPersistWorkspaceLayout()) return;

    const storageKey = workspaceLayoutStorageKey(userId);
    try {
      localStorage.setItem(storageKey, JSON.stringify(widgets));
    } catch (e) {
      log.warn("localStorage save error", { error: e instanceof Error ? e.message : String(e) });
    }

    // This run is just adopting a change another tab already broadcast and saved —
    // mirror to localStorage (above) only, skip re-broadcasting/re-PATCHing the same data.
    if (applyingRemoteUpdateRef.current) {
      applyingRemoteUpdateRef.current = false;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      return;
    }

    // When all windows are closed, persist to server immediately (no debounce) so that
    // a fast page refresh sees the cleared state from the server and does not re-open
    // the old layout via Phase 2.
    if (widgets.length === 0) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      persistLayout([], userId);
    } else {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        if (activeUserIdRef.current !== userId) return;
        if (!canPersistWorkspaceLayout()) return;
        persistLayout(widgets, userId);
      }, 400);
    }

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [widgets, hasHydrated, userId, persistLayout]);

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
      // Append on every viewport — opening a widget no longer closes the others;
      // previous windows stay open in the background (reachable via the window
      // switcher / minimized dock). On mobile the new one opens on top (maximized).
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

  const updateWidgetLiveData = useCallback(
    (id: string, liveData: Record<string, unknown> | null) => {
      setWidgets((prev) => prev.map((w) => (w.id === id ? { ...w, liveData } : w)));
    },
    [],
  );

  const closeWidget = useCallback((id: string) => {
    setWidgets(prev => {
      const next = prev.filter(w => w.id !== id);
      // Flush to the server immediately (force, bypassing the 400ms debounce) so a
      // refresh right after closing can't restore the window from a stale server copy.
      if (userId) {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        persistLayout(next, userId, { force: true });
      }
      return next;
    });
  }, [userId, persistLayout]);

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
    if (userId && canPersistWorkspaceLayout()) {
      try {
        localStorage.removeItem(workspaceLayoutStorageKey(userId));
      } catch { /* quota */ }
      persistLayout([], userId);
    }
  }, [userId, persistLayout]);

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
      const next = prev.map((w) => {
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
      if (userId) {
        queueMicrotask(() => {
          if (activeUserIdRef.current === userId) {
            persistLayout(next, userId);
          }
        });
      }
      return next;
    });
  }, [userId, persistLayout]);

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
    updateWidgetLiveData,
  };
}
