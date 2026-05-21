import type { ScreenDecodePolicy } from "@/lib/ai/screen-decode-policy";
import type { ScanExtractionV5 } from "@/lib/scan-schema-v5";
import type { WidgetType } from "@/hooks/use-window-manager";

export type ScanPostActionContext = {
  projectId: string | null;
  v5: ScanExtractionV5;
  policy: ScreenDecodePolicy;
  openWorkspaceWidget?: (
    type: WidgetType,
    data?: Record<string, unknown> | null,
  ) => string | void;
};

export type ScanPostActionResult = {
  applied: string[];
  skipped: string[];
};

/** מפעיל פעולות post-scan (יומן, BOQ, ERP, מחברת) — לא הרסני בלי projectId */
export async function runScanPostActions(
  ctx: ScanPostActionContext,
): Promise<ScanPostActionResult> {
  const applied: string[] = [];
  const skipped: string[] = [];
  const { projectId, v5, policy, openWorkspaceWidget } = ctx;

  for (const action of policy.postActions) {
    if (action === "work_diary") {
      if (!projectId) {
        skipped.push("work_diary");
        continue;
      }
      const desc = v5.summary?.trim() || v5.docType || "רשומה מסריקה";
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/work-diaries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          description: desc.slice(0, 2000),
          progress: 0,
          isSyncedToAI: true,
        }),
      });
      if (res.ok) applied.push("work_diary");
      else skipped.push("work_diary");
      continue;
    }

    if (action === "boq") {
      if (!projectId) {
        skipped.push(action);
        continue;
      }
      openWorkspaceWidget?.("project", {
        projectId,
        tab: "financial",
        excelPreview: {
          boqLines: v5.billOfQuantities,
          summary: v5.summary,
        },
      });
      applied.push(action);
      continue;
    }

    if (action === "erp") {
      openWorkspaceWidget?.("erpArchive", {
        preload: {
          vendor: v5.vendor,
          total: v5.total,
          summary: v5.summary,
          lineItems: v5.lineItems,
        },
      });
      applied.push("erp");
      continue;
    }

    if (action === "notebook") {
      if (!projectId) {
        skipped.push("notebook");
        continue;
      }
      openWorkspaceWidget?.("notebookLM", {
        projectId,
        title: v5.documentMetadata.project ?? "מחברת פרויקט",
        preloadSources: v5.summary
          ? [{ name: "סיכום סריקה", content: v5.summary, type: "text" }]
          : [],
      });
      applied.push("notebook");
      continue;
    }

    if (action === "crm") {
      openWorkspaceWidget?.("crmTable", {});
      applied.push("crm");
    }
  }

  return { applied, skipped };
}
