import type { ScanExtractionV5 } from "@/lib/scan-schema-v5";
import type { WidgetType } from "@/hooks/use-window-manager";

export type EngineMeta = {
  configured: { documentAI: boolean; gemini: boolean; openai: boolean };
  gemini?: { primaryLabel?: string };
  openai?: { defaultModelId?: string };
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
}

export interface ScanHistoryItem {
  id: string;
  fileName: string;
  vendor: string;
  amount: number;
  date: string;
  status: "success" | "warning" | "error";
}

export type QueueStatus = "pending" | "processing" | "done" | "error";

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
};
