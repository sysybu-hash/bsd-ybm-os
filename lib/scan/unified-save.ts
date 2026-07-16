import { prisma } from "@/lib/prisma";
import {
  buildTriEngineAiDataRecord,
  persistTriEngineToErp,
} from "@/lib/tri-engine-api-common";
import { saveScannedDocumentAction } from "@/app/actions/save-scanned-document";
import { resolvePolicyForIndustry, inferScreenTypeFromFileForIndustry } from "@/lib/ai/screen-decode-policy";
import { runScanPostActionsServer } from "@/lib/ai/scan-post-actions";
import { v5ToPersistableAiData } from "@/lib/scan-schema-v5";
import { createExpenseFromScan } from "@/lib/workspace-api/expense-from-scan";
import { createLogger } from "@/lib/logger";
import type { UnifiedSaveInput, UnifiedSaveResult } from "@/lib/scan/unified-scan-types";
import type { WidgetType } from "@/hooks/use-window-manager";

const log = createLogger("unified-save");

export type UnifiedSaveServerContext = {
  userId: string;
  organizationId: string;
  industry?: string;
};

/**
 * נקודת שמירה אחידה — ERP, CRM, פרויקט, מחברת, הוצאה.
 * נקרא מ-API route או server action.
 */
export async function unifiedSaveScan(
  input: UnifiedSaveInput,
  ctx: UnifiedSaveServerContext,
): Promise<UnifiedSaveResult> {
  try {
    const aiData = {
      ...input.aiData,
      ...v5ToPersistableAiData(input.v5),
      _v5: input.v5,
    };

    if (input.target === "crm") {
      const result = await saveScannedDocumentAction(
        input.fileName,
        aiData,
        "CRM",
        input.contactId ?? undefined,
      );
      if (!result.success) {
        return { ok: false, error: result.error ?? "שמירה ל-CRM נכשלה" };
      }
      return { ok: true, documentId: result.documentId };
    }

    if (input.target === "erp" || input.target === "project") {
      const { documentId, driveWebViewLink } = await persistTriEngineToErp({
        file: input.file,
        aiData,
        userId: ctx.userId,
        organizationId: ctx.organizationId,
      });

      const appliedPostActions: string[] = [];
      if (input.target === "project" && input.projectId) {
        const industry =
          ctx.industry ??
          (await prisma.organization.findUnique({
            where: { id: ctx.organizationId },
            select: { industry: true },
          }))?.industry ??
          "CONSTRUCTION";

        const policy = resolvePolicyForIndustry(
          inferScreenTypeFromFileForIndustry(input.fileName, input.file.type || "", industry),
          industry,
        );

        const post = await runScanPostActionsServer({
          projectId: input.projectId,
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          v5: input.v5,
          policy,
        });
        appliedPostActions.push(...post.applied);
      }

      return {
        ok: true,
        documentId,
        driveWebViewLink,
        appliedPostActions,
      };
    }

    if (input.target === "expense") {
      const { documentId, driveWebViewLink } = await persistTriEngineToErp({
        file: input.file,
        aiData,
        userId: ctx.userId,
        organizationId: ctx.organizationId,
      });

      await createExpenseFromScan(ctx.organizationId, {
        v5: input.v5,
        sourceDocumentId: documentId,
        aiExtractedJson: aiData as object,
        projectId: input.projectId ?? null,
        auditUserId: ctx.userId,
      });

      return { ok: true, documentId, driveWebViewLink };
    }

    if (input.target === "notebook") {
      return {
        ok: false,
        error: "שמירה למחברת מתבצעת מהלקוח דרך /api/notebooklm/from-scan",
      };
    }

    return { ok: false, error: "יעד שמירה לא ידוע" };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("unified_save_failed", err, { target: input.target });
    return { ok: false, error: msg };
  }
}

/** בונה aiData לשמירה מתוצאת extract */
export function buildAiDataForSave(
  v5: import("@/lib/scan-schema-v5").ScanExtractionV5,
  telemetry?: import("@/lib/tri-engine-types").TriEngineTelemetry | null,
): Record<string, unknown> {
  if (telemetry) {
    return buildTriEngineAiDataRecord(v5, telemetry);
  }
  return { ...v5ToPersistableAiData(v5), _v5: v5 };
}

export type ClientPostActionOpener = (
  type: WidgetType,
  data?: Record<string, unknown> | null,
) => string | void;
