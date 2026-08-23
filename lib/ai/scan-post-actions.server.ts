/**
 * Server-only half of the scan post-actions — reaches Prisma.
 *
 * Split out of `./scan-post-actions.ts` during the Next 16 upgrade: the two
 * halves shared a module, and Turbopack (unlike webpack) would not tree-shake
 * the Prisma import out of the client bundle that the AI scanner pulls in.
 */
import { prisma } from "@/lib/prisma";
import { requireProjectForOrg } from "@/lib/projects/project-access";
import { createLogger } from "@/lib/logger";
import type {
  ScanPostActionResult,
  ScanPostActionServerContext,
} from "@/lib/ai/scan-post-actions";

const log = createLogger("scan-post-actions");

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
