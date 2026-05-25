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
    case "settings": {
      const segment = state.segment as string | undefined;
      return segment?.trim() ? segment.trim() : null;
    }
    case "project": {
      const id = state.projectId as string | undefined;
      return id ? `p:${id}` : null;
    }
    case "fieldCopilot": {
      const sessionId = state.sessionId as string | undefined;
      const step = state.step as number | undefined;
      if (sessionId) return `s:${sessionId}${step != null ? `,step:${step}` : ""}`;
      return step != null ? `step:${step}` : null;
    }
    case "financeHub":
    case "documentsHub":
    case "aiHub": {
      const tab = state.tab as string | undefined;
      return tab?.trim() ? `t:${tab.trim()}` : null;
    }
    case "projectsHub": {
      const parts: string[] = [];
      const tab = state.tab as string | undefined;
      if (tab?.trim()) parts.push(`t:${tab.trim()}`);
      if (state.projectId) parts.push(`p:${String(state.projectId)}`);
      return parts.length ? parts.join(",") : null;
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
    case "settings":
      return { segment: raw };
    case "project":
      return raw.startsWith("p:") ? { projectId: raw.slice(2) } : null;
    case "fieldCopilot": {
      const state: WidgetViewState = {};
      for (const part of raw.split(",")) {
        if (part.startsWith("s:")) state.sessionId = part.slice(2);
        else if (part.startsWith("step:")) state.step = Number(part.slice(5)) || 0;
      }
      return Object.keys(state).length > 0 ? state : null;
    }
    case "financeHub":
    case "documentsHub":
    case "aiHub": {
      if (raw.startsWith("t:")) return { tab: raw.slice(2) };
      return { tab: raw };
    }
    case "projectsHub": {
      const state: WidgetViewState = {};
      for (const part of raw.split(",")) {
        if (part.startsWith("t:")) state.tab = part.slice(2);
        else if (part.startsWith("p:")) state.projectId = part.slice(2);
      }
      return Object.keys(state).length > 0 ? state : null;
    }
    default:
      return null;
  }
}
