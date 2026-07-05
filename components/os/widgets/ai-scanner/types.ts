import type { ScanExtractionV5 } from "@/lib/scan-schema-v5";
import type { ScanValidationResult } from "@/lib/scan-validate";
import type { WidgetType } from "@/hooks/use-window-manager";

export type EngineMeta = {
  configured: { documentAI: boolean; gemini: boolean; openai: boolean; mistral: boolean; anthropic?: boolean };
  missingConfig?: { documentAI?: string[]; gemini?: string[]; openai?: string[]; mistral?: string[]; anthropic?: string[] };
  gemini?: { primaryLabel?: string };
  openai?: { defaultModelId?: string };
  mistral?: { primaryLabel?: string };
};

export interface DocumentAnalysis {
  amount: number;
  vendor: string;
  taxId?: string;
  projectSuggestion: string;
  confidence: number;
  summary: string;
  date?: string;
  documentId?: string;
  rawAiData?: Record<string, unknown>;
  v5?: ScanExtractionV5;
  /** תוצאת אימות מהשרת — בעיות שנמצאו + ציון ביטחון */
  validation?: ScanValidationResult;
  /** קישור לקובץ המקורי ב-Google Drive (null אם Drive לא מחובר) */
  driveWebViewLink?: string | null;
}

export interface ScanHistoryItem {
  id: string;
  fileName: string;
  vendor: string;
  amount: number;
  date: string;
  status: "success" | "warning" | "error";
}

export type QueueStatus = "pending" | "processing" | "done" | "error" | "queued";

export interface QueueItem {
  id: string;
  file: File;
  status: QueueStatus;
  error?: string;
}

export type AiScannerWidgetProps = {
  liveData?: Record<string, unknown> | null;
  openWorkspaceWidget?: (type: WidgetType, data?: Record<string, unknown> | null) => void;
  /** מוצג כטאב בתוך documentsHub — ללא פתיחת חלון נפרד */
  embeddedInHub?: boolean;
  /** סריקה ישירה להוצאת משרד — ללא פרויקט, שמירה ליעד expense בלבד */
  officeExpenseMode?: boolean;
  /** מצב סריקה ראשוני (למשל INVOICE_FINANCIAL להוצאות משרד) */
  initialScanModeOverride?: import("@/lib/scan-modes-for-ui").ScanModeUiSelection;
  /** נקרא אחרי שמירה מוצלחת של סריקה */
  onSaveComplete?: () => void;
};
