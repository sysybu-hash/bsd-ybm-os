import type { WidgetType } from "@/hooks/use-window-manager";
import { isCompanyMgmtIndustry } from "@/lib/business-lines";
import type {
  LauncherDefaultOptions,
  LauncherSlot,
  UserLauncherConfig,
} from "./user-launcher-config.types";

function slot(id: WidgetType): LauncherSlot {
  return { widgetId: id };
}

function gridSlot(id: WidgetType, row: number, col: number): LauncherSlot {
  return { widgetId: id, row, col };
}

/**
 * 8 אריחי Hub — רשת 4×2 (קואורדינטות LTR על המסך).
 * שורה 0: CRM · פרויקטים · פיננסים · מסמכים
 * שורה 1: קופיילוט שטח · AI · יומן Google · עזרה
 * (Meckano נוסף רק למנוי מורשה דרך ensureMeckanoLauncherSlots)
 */
export const DEFAULT_QUICK_GRID: LauncherSlot[] = [
  gridSlot("crmTable", 0, 0),
  gridSlot("projectsHub", 0, 1),
  gridSlot("financeHub", 0, 2),
  gridSlot("documentsHub", 0, 3),
  gridSlot("fieldCopilot", 1, 0),
  gridSlot("aiHub", 1, 1),
  gridSlot("googleCalendar", 1, 2),
  gridSlot("helpCenter", 1, 3),
];

/** ניהול עסק / מנהל פלטפורמה — 4×2 ללא שטח/Meckano */
export const BUSINESS_MGMT_QUICK_GRID: LauncherSlot[] = [
  gridSlot("crmTable", 0, 0),
  gridSlot("projectsHub", 0, 1),
  gridSlot("financeHub", 0, 2),
  gridSlot("documentsHub", 0, 3),
  gridSlot("aiHub", 1, 0),
  gridSlot("googleCalendar", 1, 1),
  gridSlot("googleDrive", 1, 2),
  gridSlot("helpCenter", 1, 3),
];

/** מוצגים בתחתית הסרגל — לא ברשימת האפליקציות */
export const SIDEBAR_FOOTER_WIDGETS = new Set<WidgetType>([
  "settings",
  "helpCenter",
  "platformAdmin",
]);

export function usesBusinessMgmtQuickGrid(
  industryRaw?: string | null,
  isPlatformAdmin?: boolean,
): boolean {
  return Boolean(isPlatformAdmin) || isCompanyMgmtIndustry(industryRaw);
}

export function buildDefaultQuickGrid(
  industryRaw?: string | null,
  options?: LauncherDefaultOptions,
): LauncherSlot[] {
  const source = usesBusinessMgmtQuickGrid(industryRaw, options?.isPlatformAdmin)
    ? BUSINESS_MGMT_QUICK_GRID
    : DEFAULT_QUICK_GRID;
  return source.map((s) => ({ ...s }));
}

export function isQuickGridEmpty(raw: unknown): boolean {
  if (!Array.isArray(raw) || raw.length === 0) return true;
  return raw.every((s) => {
    if (!s || typeof s !== "object") return true;
    const w = (s as LauncherSlot).widgetId;
    return w === null || w === undefined;
  });
}

/** אין שמירה מותאמת — משתמשים בברירת מחדל הפלטפורמה */
export function shouldUsePlatformLauncherDefault(partial: unknown): boolean {
  if (!partial || typeof partial !== "object") return true;
  return isQuickGridEmpty((partial as Partial<UserLauncherConfig>).quickGrid);
}

export function buildDefaultLauncherConfig(
  industryRaw?: string | null,
  options?: LauncherDefaultOptions,
): UserLauncherConfig {
  const company = isCompanyMgmtIndustry(industryRaw);
  const quickGrid = buildDefaultQuickGrid(industryRaw, options);

  return {
    version: 2,
    quickGrid,
    sidebar: [
      slot("financeHub"),
      slot("projectsHub"),
      slot("crmTable"),
      slot("documentsHub"),
      ...(company ? [] : [slot("fieldCopilot")]),
      slot("aiHub"),
      slot("appBuilder"),
      slot("googleDrive"),
      slot("accessibility"),
    ],
    mobileBarStart: company
      ? [slot("financeHub"), slot("documentsHub"), slot("crmTable")]
      : [slot("fieldCopilot"), slot("documentsHub"), slot("projectsHub")],
    mobileBarEnd: [slot("aiHub")],
    mobileMore: [
      ...(company ? [] : [slot("fieldCopilot")]),
      slot("financeHub"),
      slot("projectsHub"),
      slot("crmTable"),
      slot("googleDrive"),
      slot("helpCenter"),
      slot("settings"),
      slot("accessibility"),
    ],
  };
}

/** ברירת מחדל לפי ענף — בנייה וניהול חברה משתמשים באותה פריסת 12 אריחים */
export function buildIndustryLauncherConfig(
  industryRaw?: string | null,
  options?: LauncherDefaultOptions,
): UserLauncherConfig {
  return buildDefaultLauncherConfig(industryRaw, options);
}

export function getDefaultLauncherConfig(
  industryRaw?: string | null,
  options?: LauncherDefaultOptions,
): UserLauncherConfig {
  return buildIndustryLauncherConfig(industryRaw, options);
}
