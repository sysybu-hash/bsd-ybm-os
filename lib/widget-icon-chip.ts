import type { WidgetType } from "@/hooks/use-window-manager";

/**
 * צבעי "שבב" לאייקוני ווידג'טים — תואמים לכרטיסי הפעולה המהירה (כחול, סגול, ירוק וכו').
 * משמש סרגל צד, מסך ריק וניווט מובייל.
 */
export function widgetIconChipClass(type: WidgetType): string {
  const map: Partial<Record<WidgetType, string>> = {
    dashboard: "bg-cyan-500/15 text-cyan-300 group-hover:bg-cyan-500/28",
    projectBoard: "bg-sky-500/15 text-sky-300 group-hover:bg-sky-500/28",
    crmTable: "bg-violet-500/15 text-violet-200 group-hover:bg-violet-500/28",
    erpArchive: "bg-emerald-500/15 text-emerald-300 group-hover:bg-emerald-500/28",
    docCreator: "bg-amber-500/15 text-amber-300 group-hover:bg-amber-500/28",
    aiScanner: "bg-orange-500/15 text-orange-300 group-hover:bg-orange-500/28",
    aiChatFull: "bg-purple-500/15 text-purple-300 group-hover:bg-purple-500/28",
    meckanoReports: "bg-rose-500/12 text-rose-300 group-hover:bg-rose-500/24",
    googleDrive: "bg-blue-500/15 text-blue-300 group-hover:bg-blue-500/28",
    googleAssistant: "bg-fuchsia-500/12 text-fuchsia-300 group-hover:bg-fuchsia-500/24",
    notebookLM: "bg-amber-500/15 text-amber-300 group-hover:bg-amber-500/28",
    settings: "bg-slate-500/20 text-slate-300 group-hover:bg-slate-500/32",
    project: "bg-indigo-500/15 text-indigo-200 group-hover:bg-indigo-500/28",
    crm: "bg-violet-500/15 text-violet-200 group-hover:bg-violet-500/28",
    cashflow: "bg-teal-500/15 text-teal-300 group-hover:bg-teal-500/28",
    aiChat: "bg-purple-500/15 text-purple-300 group-hover:bg-purple-500/28",
    erp: "bg-emerald-500/15 text-emerald-300 group-hover:bg-emerald-500/28",
    quoteGen: "bg-amber-500/15 text-amber-300 group-hover:bg-amber-500/28",
  };
  return map[type] ?? "bg-indigo-500/15 text-indigo-200 group-hover:bg-indigo-500/28";
}

/** כפתור עזרה (אייקון שאלה) — נפרד מצ'אט AI */
export const helpIconChipClass = "bg-sky-500/15 text-sky-300 group-hover:bg-sky-500/28";
