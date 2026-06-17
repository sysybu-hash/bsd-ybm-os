"use client";

import type { ScanExtractionV5 } from "@/lib/scan-schema-v5";
import type { UnifiedSaveTarget } from "@/lib/scan/unified-scan-types";

export type UnifiedSaveClientPayload = {
  target: UnifiedSaveTarget;
  fileName: string;
  v5: ScanExtractionV5;
  aiData?: Record<string, unknown>;
  projectId?: string;
  contactId?: string;
  documentId?: string;
};

export type UnifiedSaveClientResult = {
  ok: boolean;
  documentId?: string;
  driveWebViewLink?: string | null;
  appliedPostActions?: string[];
  error?: string;
};

/** שמירה מאוחדת מהלקוח דרך API */
export async function unifiedSaveFromClient(
  file: File,
  payload: UnifiedSaveClientPayload,
): Promise<UnifiedSaveClientResult> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("payload", JSON.stringify(payload));

  const res = await fetch("/api/scan/save", {
    method: "POST",
    body: formData,
    credentials: "include",
  });

  const data = (await res.json().catch(() => ({}))) as UnifiedSaveClientResult & {
    error?: string;
  };

  if (!res.ok) {
    return { ok: false, error: data.error ?? `שגיאה ${res.status}` };
  }

  return {
    ok: data.ok ?? true,
    documentId: data.documentId,
    driveWebViewLink: data.driveWebViewLink,
    appliedPostActions: data.appliedPostActions,
  };
}
