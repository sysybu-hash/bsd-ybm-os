import type { ScanExtractionV5, ScanModeV5 } from "@/lib/scan-schema-v5";
import type { TriEngineRunMode } from "@/lib/tri-engine-api-common";
import type { TriEngineTelemetry } from "@/lib/tri-engine-types";
import type { ScanValidationResult } from "@/lib/scan-validate";

/** מקור הכניסה לסריקה מאוחדת */
export type UnifiedScanSource =
  | "hub"
  | "drive"
  | "dropzone"
  | "share"
  | "project"
  | "field_copilot"
  | "queue";

/** יעד שמירה אחרי סקירה */
export type UnifiedSaveTarget = "erp" | "crm" | "project" | "notebook" | "expense";

export type UnifiedScanPhase =
  | "idle"
  | "intake"
  | "processing"
  | "review"
  | "save";

export type UnifiedScanSession = {
  id: string;
  source: UnifiedScanSource;
  fileName: string;
  scanMode: ScanModeV5;
  engineRunMode: TriEngineRunMode;
  projectId?: string | null;
  clientId?: string | null;
  contactId?: string | null;
  v5?: ScanExtractionV5 | null;
  aiData?: Record<string, unknown> | null;
  telemetry?: TriEngineTelemetry | null;
  validation?: ScanValidationResult | null;
  documentId?: string | null;
  driveWebViewLink?: string | null;
  saveTarget?: UnifiedSaveTarget | null;
  phase: UnifiedScanPhase;
};

export type UnifiedExtractInput = {
  base64: string;
  mimeType: string;
  fileName: string;
  scanMode: ScanModeV5;
  locale: string;
  industry: string;
  orgTrade: string | null;
  messages: import("@/lib/i18n/keys").MessageTree;
  engineRunMode?: TriEngineRunMode;
  userInstruction?: string | null;
  openAiModel?: string;
};

export type UnifiedExtractResult = {
  v5: ScanExtractionV5;
  aiData: Record<string, unknown>;
  telemetry: TriEngineTelemetry;
  validation?: ScanValidationResult;
};

export type UnifiedSaveInput = {
  file: File;
  fileName: string;
  v5: ScanExtractionV5;
  aiData: Record<string, unknown>;
  target: UnifiedSaveTarget;
  userId: string;
  organizationId: string;
  projectId?: string | null;
  contactId?: string | null;
  /** תיקוני משתמש לפני שמירה */
  correctedFrom?: Record<string, unknown> | null;
  documentId?: string | null;
};

export type UnifiedSaveResult = {
  ok: boolean;
  documentId?: string;
  driveWebViewLink?: string | null;
  error?: string;
  appliedPostActions?: string[];
};

/** liveData אחיד לפתיחת סורק מכל נקודת כניסה */
export type UnifiedScanLiveData = {
  tab?: "scan";
  source?: UnifiedScanSource;
  projectId?: string;
  scanMode?: ScanModeV5;
  engineRunMode?: TriEngineRunMode;
  userInstruction?: string;
  openInstructions?: boolean;
  autoScan?: boolean;
  driveImportFile?: { fileId: string; fileName: string; mimeType?: string };
  pendingFileToken?: string;
  v5?: ScanExtractionV5;
  fileName?: string;
  triggerSaveToNotebook?: boolean;
};
