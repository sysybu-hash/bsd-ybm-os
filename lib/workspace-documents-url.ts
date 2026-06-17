import { getCanonicalSiteUrl } from "@/lib/site-metadata";
import { buildWorkspaceSearchParams } from "@/lib/workspace-url";

export type DocumentsHubTab = "archive" | "scan" | "create";

function documentsHubQuery(tab: DocumentsHubTab): string {
  const sp = buildWorkspaceSearchParams({
    widgetType: "documentsHub",
    viewState: { tab },
  });
  sp.set("tab", tab);
  return sp.toString();
}

/** נתיב יחסי ל-Hub מסמכים (ל-redirect פנימי) */
export function buildDocumentsHubPath(tab: DocumentsHubTab = "archive"): string {
  return `/workspace?${documentsHubQuery(tab)}`;
}

/** URL מלא ל-Hub מסמכים — לשימוש במיילים ו-webhooks */
export function buildDocumentsHubUrl(tab: DocumentsHubTab = "archive"): string {
  const base = getCanonicalSiteUrl().replace(/\/$/, "");
  return `${base}${buildDocumentsHubPath(tab)}`;
}
