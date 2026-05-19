import type { WidgetType } from "@/hooks/use-window-manager";
import type { ArchiveView } from "@/lib/erp-archive";
import type { WidgetViewState } from "@/lib/workspace-navigation/types";

/** מקודד מצב לפרמטר st ב-URL */
export function encodeWidgetState(type: WidgetType, state: WidgetViewState | null): string | null {
  if (!state || Object.keys(state).length === 0) return null;

  switch (type) {
    case "erpArchive": {
      const view = state.archiveView as ArchiveView | undefined;
      if (!view || view === "active") {
        const parts: string[] = [];
        if (state.projectId) parts.push(`p:${state.projectId}`);
        if (state.recentOnly) parts.push("recent");
        if (state.q) parts.push(`q:${encodeURIComponent(String(state.q))}`);
        return parts.length ? parts.join(",") : null;
      }
      return view;
    }
    case "platformAdmin": {
      const tab = state.tab as string | undefined;
      return tab && tab !== "subscriptions" ? tab : tab === "subscriptions" ? "subscriptions" : null;
    }
    case "helpCenter": {
      const cat = state.categoryId as string | undefined;
      const guide = state.guideId as string | undefined;
      if (guide) return `g:${guide}`;
      if (cat) return `c:${cat}`;
      return null;
    }
    case "googleDrive": {
      const mode = state.viewMode as string | undefined;
      return mode && mode !== "list" ? `v:${mode}` : null;
    }
    case "docCreator": {
      const id = state.issuedDocumentId as string | undefined;
      if (id) return `edit:${id}`;
      if (state.panel) return String(state.panel);
      return null;
    }
    case "aiScanner": {
      if (state.openResultsPanel) return "results";
      if (state.openPreviewPanel) return "preview";
      return null;
    }
    default:
      return null;
  }
}

export function decodeWidgetState(type: WidgetType, st: string | null): WidgetViewState | null {
  if (!st?.trim()) return null;
  const raw = st.trim();

  switch (type) {
    case "erpArchive": {
      if (raw === "shared" || raw === "trash") return { archiveView: raw };
      const state: WidgetViewState = { archiveView: "active", recentOnly: false, projectId: null };
      for (const part of raw.split(",")) {
        if (part === "recent") state.recentOnly = true;
        else if (part.startsWith("p:")) state.projectId = part.slice(2);
        else if (part.startsWith("q:")) state.q = decodeURIComponent(part.slice(2));
      }
      return state;
    }
    case "platformAdmin":
      return { tab: raw };
    case "helpCenter": {
      if (raw.startsWith("g:")) return { guideId: raw.slice(2) };
      if (raw.startsWith("c:")) return { categoryId: raw.slice(2) };
      return null;
    }
    case "googleDrive":
      return raw.startsWith("v:") ? { viewMode: raw.slice(2) } : null;
    case "docCreator": {
      if (raw.startsWith("edit:")) return { issuedDocumentId: raw.slice(5) };
      return { panel: raw };
    }
    case "aiScanner": {
      if (raw === "results") return { openResultsPanel: true };
      if (raw === "preview") return { openPreviewPanel: true };
      return null;
    }
    default:
      return null;
  }
}
