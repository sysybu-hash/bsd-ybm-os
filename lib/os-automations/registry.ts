import type { WidgetType } from "@/hooks/use-window-manager";
import { normalizeWidgetAction } from "@/lib/os-assistant/widget-catalog";
import { normalizeAutomationIntent } from "@/lib/os-automations/catalog";
import type {
  AutomationAction,
  AutomationResult,
  AutomationRunnerDeps,
  InvoiceDraftParams,
  OpenWidgetParams,
} from "@/lib/os-automations/types";

const WIDGET_BY_INTENT: Partial<Record<string, WidgetType>> = {
  open_dashboard: "dashboard",
  open_crm: "crmTable",
  open_project_board: "projectBoard",
  open_erp_archive: "erpArchive",
  open_meckano_reports: "meckanoReports",
  open_google_drive: "googleDrive",
  open_settings: "settings",
  open_accessibility: "accessibility",
};

function widgetPayload(params: Record<string, unknown>): Record<string, unknown> | null {
  const payload = params.payload;
  return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
}

export async function runAutomationAction(
  action: AutomationAction,
  deps: AutomationRunnerDeps,
): Promise<AutomationResult> {
  const intent = normalizeAutomationIntent(action.intent);
  if (!intent) {
    return { ok: false, message: `Unknown intent: ${action.intent}` };
  }

  const params = action.params ?? {};

  switch (intent) {
    case "open_widget": {
      const wp = params as OpenWidgetParams;
      const w = normalizeWidgetAction(String(wp.widgetId ?? ""));
      if (!w) return { ok: false, message: "Widget not found" };
      deps.openWidget(w, wp.payload ?? null);
      return { ok: true };
    }
    case "open_dashboard":
    case "open_crm":
    case "open_project_board":
    case "open_erp_archive":
    case "open_meckano_reports":
    case "open_google_drive":
    case "open_settings":
    case "open_accessibility": {
      const w = WIDGET_BY_INTENT[intent];
      if (!w) return { ok: false };
      deps.openWidget(w, widgetPayload(params));
      return { ok: true };
    }
    case "open_scanner":
    case "scan_with_instructions": {
      deps.openWidget("aiScanner", {
        userInstruction: String(params.userInstruction ?? ""),
        engineRunMode: String(params.engineRunMode ?? "AUTO"),
        scanMode: params.scanMode,
        openInstructions: intent === "scan_with_instructions",
        ...widgetPayload(params),
      });
      return { ok: true };
    }
    case "show_scan_preview": {
      deps.openWidget("aiScanner", { openPreviewPanel: true, ...widgetPayload(params) });
      return { ok: true };
    }
    case "show_scan_results": {
      deps.openWidget("aiScanner", { openResultsPanel: true, ...widgetPayload(params) });
      return { ok: true };
    }
    case "confirm_scan_to_erp": {
      deps.openWidget("aiScanner", { confirmToErp: true, ...widgetPayload(params) });
      return { ok: true };
    }
    case "open_ai_chat": {
      deps.openWidget("aiChatFull", {
        provider: String(params.provider ?? "gemini"),
        prompt: String(params.prompt ?? ""),
        ...widgetPayload(params),
      });
      return { ok: true };
    }
    case "open_notebook": {
      deps.openWidget("notebookLM", {
        notebookId: params.notebookId,
        title: params.title,
        preloadSources: params.preloadSources,
        ...widgetPayload(params),
      });
      return { ok: true };
    }
    case "create_invoice":
    case "create_quote": {
      const p = params as InvoiceDraftParams;
      deps.openWidget("docCreator", {
        automation: "invoice_draft",
        docType: intent === "create_quote" ? "quote" : "invoice",
        contactId: p.contactId,
        contactName: p.clientName,
        items: p.lineDescription
          ? [{ description: p.lineDescription, quantity: 1, price: Number(p.amount) || 0 }]
          : [],
        amount: p.amount,
      });
      return { ok: true };
    }
    case "edit_issued_document":
    case "assign_document_project": {
      const id = String(params.issuedDocumentId ?? params.documentId ?? "");
      if (!id) return { ok: false, message: "Missing document id" };
      deps.openWidget("docCreator", {
        issuedDocumentId: id,
        projectId: params.projectId,
      });
      return { ok: true };
    }
    case "delete_issued_document": {
      const id = String(params.issuedDocumentId ?? params.documentId ?? "");
      if (!id) return { ok: false };
      deps.openWidget("docCreator", { issuedDocumentId: id, requestDelete: true });
      return { ok: true };
    }
    case "export_document": {
      const id = String(params.issuedDocumentId ?? params.documentId ?? "");
      if (!id) return { ok: false };
      const format = String(params.format ?? "pdf");
      if (typeof window !== "undefined") {
        window.open(`/api/documents/issued/${id}/export?format=${format}`, "_blank", "noopener,noreferrer");
      }
      return { ok: true };
    }
    case "save_scan_to_notebook": {
      const last = typeof window !== "undefined" ? sessionStorage.getItem("bsd_last_scan_payload") : null;
      if (!last) {
        deps.openWidget("aiScanner");
        return { ok: true, message: "Open scanner first" };
      }
      deps.openWidget("aiScanner", { triggerSaveToNotebook: true, ...JSON.parse(last) });
      return { ok: true };
    }
    case "close_widget": {
      const id = String(params.widgetId ?? "");
      if (id) deps.closeWidget(id);
      else if (deps.widgets.length > 0) deps.closeWidget(deps.widgets[deps.widgets.length - 1].id);
      return { ok: true };
    }
    case "focus_widget": {
      const id = String(params.widgetId ?? "");
      const byType = params.widgetType as WidgetType | undefined;
      if (id) {
        deps.focusWidget(id);
      } else if (byType) {
        const w = deps.widgets.find((x) => x.type === byType);
        if (w) deps.focusWidget(w.id);
      }
      return { ok: true };
    }
    case "toggle_maximize": {
      const id = String(params.widgetId ?? "");
      if (id) deps.toggleMaximize(id);
      else if (deps.widgets.length > 0) deps.toggleMaximize(deps.widgets[deps.widgets.length - 1].id);
      return { ok: true };
    }
    case "meckano_clock_in":
      await deps.reportMeckanoAttendance?.("in");
      return { ok: true };
    case "meckano_clock_out":
      await deps.reportMeckanoAttendance?.("out");
      return { ok: true };
    case "clear_layout":
      deps.clearLayout();
      return { ok: true };
    case "clean_dashboard":
      deps.clearLayout();
      return { ok: true };
    case "switch_window":
      deps.openWindowSwitcher?.();
      return { ok: true };
    case "google_assistant_command": {
      const query = String(params.query ?? "").trim();
      if (!query) return { ok: false };
      try {
        const res = await fetch("/api/os/google-assistant/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query }),
          credentials: "include",
        });
        const data = await res.json();
        const text = typeof data.fulfillmentText === "string" ? data.fulfillmentText : "";
        if (text) deps.setSystemMessage(text);
      } catch {
        return { ok: false };
      }
      return { ok: true };
    }
    case "search_client": {
      const q = String(params.query ?? params.clientName ?? "").trim();
      if (!q) return { ok: false };
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { credentials: "include" });
        const data = await res.json();
        const results = Array.isArray(data.results) ? data.results : [];
        if (results[0]?.type === "project") {
          deps.openWidget("project", { name: results[0].name });
        } else {
          deps.openWidget("crmTable");
        }
      } catch {
        return { ok: false };
      }
      return { ok: true };
    }
    case "open_project": {
      const name = String(params.name ?? params.projectName ?? "");
      deps.openWidget("project", { name });
      return { ok: true };
    }
    default:
      return { ok: false, message: `Unhandled: ${intent}` };
  }
}

export async function runAutomationPlan(
  actions: AutomationAction[],
  deps: AutomationRunnerDeps,
): Promise<AutomationResult[]> {
  const results: AutomationResult[] = [];
  for (const action of actions) {
    results.push(await runAutomationAction(action, deps));
  }
  return results;
}
