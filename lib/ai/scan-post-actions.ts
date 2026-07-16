import type { ScreenDecodePolicy } from "@/lib/ai/screen-decode-policy";
import type { ScanExtractionV5 } from "@/lib/scan-schema-v5";
import type { WidgetType } from "@/hooks/use-window-manager";
import { prisma } from "@/lib/prisma";
import { requireProjectForOrg } from "@/lib/projects/project-access";
import { createLogger } from "@/lib/logger";

const log = createLogger("scan-post-actions");

export type ScanPostActionContext = {
  projectId: string | null;
  v5: ScanExtractionV5;
  policy: ScreenDecodePolicy;
  openWorkspaceWidget?: (
    type: WidgetType,
    data?: Record<string, unknown> | null,
  ) => string | void;
};

export type ScanPostActionServerContext = {
  projectId: string | null;
  organizationId: string;
  userId: string;
  v5: ScanExtractionV5;
  policy: ScreenDecodePolicy;
};

export type ScanPostActionResult = {
  applied: string[];
  skipped: string[];
};

/**
 * Client-side post-actions (fetch cookies + open widgets).
 * Prefer this from browser after save; work_diary uses relative fetch.
 */
export async function runScanPostActionsClient(
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
      continue;
    }

    if (action === "tasks") {
      if (!projectId || !openWorkspaceWidget) {
        skipped.push("tasks");
        continue;
      }
      openWorkspaceWidget("projectBoard", {
        projectId,
        preloadTask: {
          title: (v5.summary?.slice(0, 120) || v5.docType || "משימה מסריקה") as string,
          description: (v5.summary?.slice(120, 620) ?? "") as string,
          status: "todo",
          priority: "medium",
        },
      });
      applied.push("tasks");
      continue;
    }
  }

  return { applied, skipped };
}

/**
 * Server-side post-actions — Prisma only (no relative fetch).
 * UI-only actions (boq/erp/notebook/crm/tasks) are skipped here; client runs them.
 */
export async function runScanPostActionsServer(
  ctx: ScanPostActionServerContext,
): Promise<ScanPostActionResult> {
  const applied: string[] = [];
  const skipped: string[] = [];
  const { projectId, organizationId, userId, v5, policy } = ctx;

  for (const action of policy.postActions) {
    if (action === "work_diary") {
      if (!projectId) {
        skipped.push("work_diary");
        continue;
      }
      const gate = await requireProjectForOrg(projectId, organizationId);
      if (!gate.ok) {
        skipped.push("work_diary");
        continue;
      }
      const desc = (v5.summary?.trim() || v5.docType || "רשומה מסריקה").slice(0, 2000);
      try {
        const diary = await prisma.workDiary.create({
          data: {
            projectId,
            organizationId,
            description: desc,
            workersCount: 1,
            progress: 0,
            isSyncedToAI: true,
            date: new Date(),
            createdByUserId: userId,
          },
        });
        if (diary.isSyncedToAI) {
          try {
            const { createProjectNote } = await import("@/lib/workspace-api/project-detail");
            await createProjectNote(organizationId, userId, projectId, `[יומן עבודה] ${desc}`);
          } catch {
            /* non-blocking */
          }
        }
        applied.push("work_diary");
      } catch (err) {
        log.warn("work_diary_server_failed", { projectId, err });
        skipped.push("work_diary");
      }
      continue;
    }

    // Widget-only actions — client after save
    if (
      action === "boq" ||
      action === "erp" ||
      action === "notebook" ||
      action === "crm" ||
      action === "tasks"
    ) {
      skipped.push(action);
      continue;
    }
  }

  return { applied, skipped };
}

/** @deprecated use runScanPostActionsClient — kept for existing imports */
export const runScanPostActions = runScanPostActionsClient;
