import type { WidgetType } from "@/hooks/use-window-manager";

/**
 * צבעי "שבב" לאייקוני ווידג'טים — תואמים לכרטיסי הפעולה המהירה (כחול, סגול, ירוק וכו').
 * משמש סרגל צד, מסך ריק וניווט מובייל.
 */
export function widgetIconChipClass(type: WidgetType): string {
  // Light mode: stronger tint (/22) + dark-700 text for contrast.
  // Dark mode (dark:): vivid tint (/28) + bright-200 text so icons read clearly.
  const map: Partial<Record<WidgetType, string>> = {
    dashboard: "bg-cyan-500/22 text-cyan-700 group-hover:bg-cyan-500/30 dark:bg-cyan-500/28 dark:text-cyan-200 dark:group-hover:bg-cyan-500/38",
    projectBoard: "bg-sky-500/22 text-sky-700 group-hover:bg-sky-500/30 dark:bg-sky-500/28 dark:text-sky-200 dark:group-hover:bg-sky-500/38",
    crmTable: "bg-violet-500/22 text-violet-700 group-hover:bg-violet-500/30 dark:bg-violet-500/28 dark:text-violet-200 dark:group-hover:bg-violet-500/38",
    erpArchive: "bg-emerald-500/22 text-emerald-700 group-hover:bg-emerald-500/30 dark:bg-emerald-500/28 dark:text-emerald-200 dark:group-hover:bg-emerald-500/38",
    docCreator: "bg-amber-500/22 text-amber-700 group-hover:bg-amber-500/30 dark:bg-amber-500/28 dark:text-amber-200 dark:group-hover:bg-amber-500/38",
    aiScanner: "bg-orange-500/22 text-orange-700 group-hover:bg-orange-500/30 dark:bg-orange-500/28 dark:text-orange-200 dark:group-hover:bg-orange-500/38",
    aiChatFull: "bg-purple-500/22 text-purple-700 group-hover:bg-purple-500/30 dark:bg-purple-500/28 dark:text-purple-200 dark:group-hover:bg-purple-500/38",
    meckanoReports: "bg-rose-500/20 text-rose-700 group-hover:bg-rose-500/28 dark:bg-rose-500/26 dark:text-rose-200 dark:group-hover:bg-rose-500/36",
    googleDrive: "bg-blue-500/22 text-blue-700 group-hover:bg-blue-500/30 dark:bg-blue-500/28 dark:text-blue-200 dark:group-hover:bg-blue-500/38",
    notebookLM: "bg-amber-500/22 text-amber-700 group-hover:bg-amber-500/30 dark:bg-amber-500/28 dark:text-amber-200 dark:group-hover:bg-amber-500/38",
    settings: "bg-slate-500/22 text-slate-700 group-hover:bg-slate-500/32 dark:bg-slate-500/28 dark:text-slate-200 dark:group-hover:bg-slate-500/38",
    project: "bg-indigo-500/22 text-indigo-700 group-hover:bg-indigo-500/30 dark:bg-indigo-500/28 dark:text-indigo-200 dark:group-hover:bg-indigo-500/38",
    crm: "bg-violet-500/22 text-violet-700 group-hover:bg-violet-500/30 dark:bg-violet-500/28 dark:text-violet-200 dark:group-hover:bg-violet-500/38",
    cashflow: "bg-teal-500/22 text-teal-700 group-hover:bg-teal-500/30 dark:bg-teal-500/28 dark:text-teal-200 dark:group-hover:bg-teal-500/38",
    aiChat: "bg-purple-500/22 text-purple-700 group-hover:bg-purple-500/30 dark:bg-purple-500/28 dark:text-purple-200 dark:group-hover:bg-purple-500/38",
    erp: "bg-emerald-500/22 text-emerald-700 group-hover:bg-emerald-500/30 dark:bg-emerald-500/28 dark:text-emerald-200 dark:group-hover:bg-emerald-500/38",
    quoteGen: "bg-amber-500/22 text-amber-700 group-hover:bg-amber-500/30 dark:bg-amber-500/28 dark:text-amber-200 dark:group-hover:bg-amber-500/38",
    platformAdmin: "bg-amber-500/22 text-amber-700 group-hover:bg-amber-500/30 dark:bg-amber-500/28 dark:text-amber-300 dark:group-hover:bg-amber-500/38",
    helpCenter: "bg-sky-500/22 text-sky-700 group-hover:bg-sky-500/30 dark:bg-sky-500/28 dark:text-sky-200 dark:group-hover:bg-sky-500/38",
    fieldCopilot: "bg-emerald-500/22 text-emerald-700 group-hover:bg-emerald-500/30 dark:bg-emerald-500/28 dark:text-emerald-200 dark:group-hover:bg-emerald-500/38",
    financeHub: "bg-cyan-500/22 text-cyan-700 group-hover:bg-cyan-500/30 dark:bg-cyan-500/28 dark:text-cyan-200 dark:group-hover:bg-cyan-500/38",
    projectsHub: "bg-sky-500/22 text-sky-700 group-hover:bg-sky-500/30 dark:bg-sky-500/28 dark:text-sky-200 dark:group-hover:bg-sky-500/38",
    documentsHub: "bg-emerald-500/22 text-emerald-700 group-hover:bg-emerald-500/30 dark:bg-emerald-500/28 dark:text-emerald-200 dark:group-hover:bg-emerald-500/38",
    aiHub: "bg-purple-500/22 text-purple-700 group-hover:bg-purple-500/30 dark:bg-purple-500/28 dark:text-purple-200 dark:group-hover:bg-purple-500/38",
    accessibility: "bg-slate-500/22 text-slate-700 group-hover:bg-slate-500/32 dark:bg-slate-500/28 dark:text-slate-200 dark:group-hover:bg-slate-500/38",
    universalCommand: "bg-gradient-to-br from-blue-500/25 to-indigo-500/25 text-blue-700 group-hover:from-blue-500/35 group-hover:to-indigo-500/35 dark:from-blue-500/30 dark:to-indigo-500/30 dark:text-blue-200",
  };
  return map[type] ?? "bg-indigo-500/22 text-indigo-700 group-hover:bg-indigo-500/30 dark:bg-indigo-500/28 dark:text-indigo-200 dark:group-hover:bg-indigo-500/38";
}

/** כפתור עזרה (אייקון שאלה) — נפרד מצ'אט AI */
export const helpIconChipClass =
  "bg-sky-500/22 text-sky-700 group-hover:bg-sky-500/30 dark:bg-sky-500/28 dark:text-sky-200 dark:group-hover:bg-sky-500/38";
