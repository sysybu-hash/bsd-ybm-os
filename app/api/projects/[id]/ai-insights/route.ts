import { NextResponse } from "next/server";
import { withWorkspacesAuthDynamic } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { createLogger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { requireProjectForOrg } from "@/lib/projects/project-access";
import { parseTaskKanbanMetadata } from "@/lib/tasks/kanban-task-mapper";

export const dynamic = "force-dynamic";

const log = createLogger("project-ai-insights");

type InsightSeverity = "MEDIUM" | "HIGH" | "CRITICAL";

type ProjectInsight = {
  type: "SCHEDULE_RISK" | "FINANCIAL_RISK" | "WORKFLOW_BOTTLENECK";
  severity: InsightSeverity;
  title: string;
  message: string;
  actionPayload?: Record<string, unknown>;
};

export const GET = withWorkspacesAuthDynamic<{ id: string }>(async (_req, { orgId }, segment) => {
  const { id: projectId } = await segment.params;
  try {
    const gate = await requireProjectForOrg(projectId, orgId);
    if (!gate.ok) return gate.response;

    const [tasks, project] = await Promise.all([
      prisma.task.findMany({
        where: { projectId, organizationId: orgId, status: { not: "DONE" } },
        select: {
          id: true,
          title: true,
          dueDate: true,
          status: true,
          metadata: true,
        },
      }),
      prisma.project.findFirst({
        where: { id: projectId, organizationId: orgId },
        select: { budget: true },
      }),
    ]);

    const insights: ProjectInsight[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lateTasks = tasks.filter((task) => {
      if (!task.dueDate) return false;
      const due = new Date(task.dueDate);
      due.setHours(0, 0, 0, 0);
      return due < today;
    });

    if (lateTasks.length > 0) {
      const firstLate = lateTasks[0]!;
      insights.push({
        type: "SCHEDULE_RISK",
        severity: lateTasks.length > 3 ? "HIGH" : "MEDIUM",
        title: "עיכובים בלוח הזמנים",
        message: `זוהו ${lateTasks.length} משימות בפיגור. מומלץ לבחון תגבור למשימה: "${firstLate.title}".`,
        actionPayload: { taskIds: lateTasks.map((t) => t.id) },
      });
    }

    let totalTaskBudget = 0;
    for (const task of tasks) {
      const meta = parseTaskKanbanMetadata(task.metadata);
      if (typeof meta.budget === "number" && meta.budget > 0) {
        totalTaskBudget += meta.budget;
      }
    }

    const projectBudget = project?.budget ?? 0;
    if (projectBudget > 0) {
      const budgetUtilization = (totalTaskBudget / projectBudget) * 100;
      if (budgetUtilization > 90) {
        insights.push({
          type: "FINANCIAL_RISK",
          severity: budgetUtilization > 100 ? "CRITICAL" : "HIGH",
          title: "סכנת חריגת תקציב",
          message: `תקציב המשימות המוקצה עומד על ${budgetUtilization.toFixed(1)}% מכלל תקציב הפרויקט. נותרו להקצאה ${Math.max(0, projectBudget - totalTaskBudget).toLocaleString("he-IL")} ₪.`,
          actionPayload: {
            currentTotal: totalTaskBudget,
            projectTotal: projectBudget,
          },
        });
      }
    }

    const reviewTasks = tasks.filter((task) => task.status === "REVIEW");
    if (reviewTasks.length >= 5) {
      insights.push({
        type: "WORKFLOW_BOTTLENECK",
        severity: "MEDIUM",
        title: "צוואר בקבוק בבקרת איכות",
        message: `ישנן ${reviewTasks.length} משימות שממתינות לאישור בעמודת "בביקורת". מומלץ לאשר אותן כדי לשחרר חסימות בפרויקט.`,
      });
    }

    return NextResponse.json({
      analyzedAt: new Date().toISOString(),
      activeTasksAnalyzed: tasks.length,
      insights,
    });
  } catch (err: unknown) {
    log.error("ai_insights_failed", {
      message: err instanceof Error ? err.message : String(err),
      projectId,
    });
    return apiErrorResponse(err, "Project AI insights GET");
  }
});
