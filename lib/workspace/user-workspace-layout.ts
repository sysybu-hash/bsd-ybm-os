import { z } from "zod";
import type { ActiveWidget, WidgetType } from "@/hooks/use-window-manager";
import { normalizeWidgetAction } from "@/lib/os-assistant/widget-catalog";

const positionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

const sizeSchema = z.object({
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
});

const widgetSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  liveData: z.record(z.string(), z.unknown()).nullable(),
  position: positionSchema,
  size: sizeSchema,
  zIndex: z.number().finite(),
  isMaximized: z.boolean().optional(),
  isMinimized: z.boolean().optional(),
  zoom: z.number().finite().optional(),
});

const layoutSchema = z.array(widgetSchema);

export const WORKSPACE_LAYOUT_STORAGE_PREFIX = "bsd_ybm_layout_quiet_v7";
export const LEGACY_GLOBAL_LAYOUT_KEY = "bsd_ybm_layout_quiet_v6";

export function workspaceLayoutStorageKey(userId: string): string {
  return `${WORKSPACE_LAYOUT_STORAGE_PREFIX}:${userId}`;
}

function isWidgetType(value: string): value is WidgetType {
  return normalizeWidgetAction(value) !== null;
}

/**
 * מסיר מ-liveData מפתחות ניווט זמניים (`__navInitial` וכו') לפני שמירה/שחזור.
 * דליפה שלהם ל-layout השמור גורמת לאותו חלון לוגי להיראות "שונה" בהשוואות
 * (deep-link matching, דה-דופליקציה בשחזור) — וכך נולדים חלונות כפולים.
 */
function stripTransientLiveData(
  liveData: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!liveData) return liveData;
  if (!Object.keys(liveData).some((k) => k.startsWith("__"))) return liveData;
  const clean = Object.fromEntries(
    Object.entries(liveData).filter(([k]) => !k.startsWith("__")),
  );
  return Object.keys(clean).length > 0 ? clean : null;
}

export function scrubWorkspaceLayout(raw: unknown): ActiveWidget[] {
  const parsed = layoutSchema.safeParse(raw);
  if (!parsed.success) return [];

  const widgets: ActiveWidget[] = [];
  for (const row of parsed.data) {
    if (!isWidgetType(row.type)) continue;
    widgets.push({
      id: row.id,
      type: row.type,
      liveData: stripTransientLiveData(row.liveData),
      position: row.position,
      size: row.size,
      zIndex: row.zIndex,
      isMaximized: row.isMaximized,
      isMinimized: row.isMinimized,
      zoom: row.zoom,
    });
  }
  return widgets;
}

export function parseWorkspaceLayoutFromStorage(raw: string | null): ActiveWidget[] {
  if (!raw) return [];
  try {
    return scrubWorkspaceLayout(JSON.parse(raw));
  } catch {
    return [];
  }
}
