import type { LucideIcon } from "lucide-react";
import type { WidgetType } from "@/hooks/use-window-manager";
import { getLauncherNavMeta } from "@/lib/launcher/launcher-icons";

/**
 * Window Identity System — נותן לכל חלון אישיות (אקצנט + אייקון) מעל שלד משותף.
 * האקצנט הוא גוון קבוע שעובד בבהיר ובכהה; ה-tints נגזרים ב-CSS דרך color-mix,
 * כך שבהיר/כהה/מסך-מלא מסתגלים אוטומטית. האייקון ממוחזר מ-getLauncherNavMeta.
 */
export type WindowIdentity = { accent: string; Icon: LucideIcon };

/** אקצנט לפי קטגוריה — חלונות קרובים חולקים גוון כדי לשמור קוהרנטיות. */
const ACCENT: Partial<Record<WidgetType, string>> = {
  // AI — סגול/ויולט
  aiChat: "#7c6cf0",
  aiChatFull: "#7c6cf0",
  aiHub: "#7c6cf0",
  notebookLM: "#8b5cf6",
  appBuilder: "#8b5cf6",
  // פיננסים / דשבורד — ירוק
  dashboard: "#1d9e75",
  financeHub: "#1d9e75",
  cashflow: "#1d9e75",
  // CRM — כחול
  crm: "#378add",
  crmTable: "#378add",
  meckanoReports: "#378add",
  // פרויקטים — אינדיגו
  project: "#5b6ef0",
  projectBoard: "#5b6ef0",
  projectsHub: "#5b6ef0",
  // מסמכים / ERP — ענבר
  erp: "#ef9f27",
  erpArchive: "#ef9f27",
  docCreator: "#ef9f27",
  documentsHub: "#ef9f27",
  quoteGen: "#d85a30",
  // סריקה / שטח — טורקיז
  aiScanner: "#14b8a6",
  fieldCopilot: "#0ea5a3",
  // לוחות שנה — ורוד
  googleCalendar: "#d4537e",
  jewishCalendar: "#d4537e",
  googleDrive: "#2f9be0",
  // האבים תפעוליים
  logisticsHub: "#0891b2",
  procurementHub: "#ca8a04",
  executiveHub: "#7c3aed",
  // מערכת / ניהול — אפור-כחלחל
  settings: "#64748b",
  platformAdmin: "#64748b",
  accessibility: "#64748b",
  helpCenter: "#64748b",
  universalCommand: "#6366f1",
};

const DEFAULT_ACCENT = "#6366f1";

export function getWindowIdentity(type: WidgetType): WindowIdentity {
  return {
    accent: ACCENT[type] ?? DEFAULT_ACCENT,
    Icon: getLauncherNavMeta(type).icon,
  };
}
