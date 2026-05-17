import type { ScanModeV5 } from "@/lib/scan-schema-v5";
import type { TriEngineRunMode } from "@/lib/tri-engine-api-common";
import type { WidgetType } from "@/hooks/use-window-manager";

export type AutomationIntent =
  | "open_widget"
  | "close_widget"
  | "focus_widget"
  | "switch_window"
  | "toggle_maximize"
  | "clear_layout"
  | "create_invoice"
  | "create_quote"
  | "edit_issued_document"
  | "delete_issued_document"
  | "export_document"
  | "assign_document_project"
  | "open_scanner"
  | "scan_with_instructions"
  | "show_scan_preview"
  | "show_scan_results"
  | "confirm_scan_to_erp"
  | "save_scan_to_notebook"
  | "open_crm"
  | "search_client"
  | "open_project_board"
  | "open_project"
  | "open_erp_archive"
  | "open_dashboard"
  | "open_meckano_reports"
  | "meckano_clock_in"
  | "meckano_clock_out"
  | "open_ai_chat"
  | "open_notebook"
  | "google_assistant_command"
  | "open_google_drive"
  | "open_settings"
  | "open_accessibility"
  | "clean_dashboard";

export type AutomationAction = {
  intent: AutomationIntent;
  params?: Record<string, unknown>;
};

export type ParseActionResponse = {
  reply: string;
  actions: AutomationAction[];
};

export type InvoiceDraftParams = {
  clientName?: string;
  contactId?: string;
  lineDescription?: string;
  amount?: number;
  currency?: string;
  docType?: "invoice" | "quote";
};

export type ScanAutomationParams = {
  userInstruction?: string;
  engineRunMode?: TriEngineRunMode;
  scanMode?: ScanModeV5;
  fileName?: string;
  notebookId?: string;
  title?: string;
  projectId?: string;
  mode?: "new" | "append";
};

export type OpenWidgetParams = {
  widgetId: WidgetType;
  payload?: Record<string, unknown> | null;
};

export type AutomationRunnerDeps = {
  openWidget: (type: WidgetType, data?: Record<string, unknown> | null) => void;
  closeWidget: (id: string) => void;
  focusWidget: (id: string) => void;
  toggleMaximize: (id: string) => void;
  clearLayout: () => void;
  widgets: { id: string; type: WidgetType; title?: string }[];
  setSystemMessage: (msg: string) => void;
  reportMeckanoAttendance?: (direction: "in" | "out") => Promise<void>;
  openWindowSwitcher?: () => void;
};

export type AutomationResult = {
  ok: boolean;
  message?: string;
};
