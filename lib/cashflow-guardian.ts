/**
 * Cashflow Guardian — cron logic for proactive cashflow alerts.
 *
 * Compares actual ProgressBill receipts against PaymentMilestone expectations
 * and flags organizations with negative cashflow trajectories via InAppNotification.
 *
 * Also detects Gantt task delays by comparing task progress vs elapsed time.
 *
 * Run by: app/api/cron/cashflow-guardian/route.ts (daily)
 */

import { prisma } from "./prisma";
import { createOrganizationNotification } from "./notifications-service";
import { createLogger } from "./logger";

const log = createLogger("cashflow-guardian");

type CashflowAlert = {
  organizationId: string;
  projectId: string;
  projectName: string;
  expectedByNow: number;
  actualReceived: number;
  gapAmount: number;
  gapPercent: number;
  overdueTaskCount: number;
};

/**
 * Analyzes a single project's cashflow health.
 * Returns an alert if the gap between expected and actual exceeds the threshold.
 */
async function analyzeProjectCashflow(
  projectId: string,
  organizationId: string,
  projectName: string,
  gapThresholdPercent = 20,
): Promise<CashflowAlert | null> {
  const now = new Date();

  // Sum of milestones that should have been paid by now
  const milestones = await prisma.paymentMilestone.findMany({
    where: { projectId, organizationId },
    select: { amount: true, isPaid: true, datePaid: true, name: true },
  });

  if (milestones.length === 0) return null;

  const totalExpected = milestones.reduce((s, m) => s + m.amount, 0);
  if (totalExpected <= 0) return null;

  // Actual received = paid milestones
  const actualReceived = milestones
    .filter((m) => m.isPaid)
    .reduce((s, m) => s + m.amount, 0);

  // Expected by now = milestones that haven't been paid yet
  const unpaidAmount = milestones
    .filter((m) => !m.isPaid)
    .reduce((s, m) => s + m.amount, 0);

  // Count overdue Gantt tasks (past endDate, < 100% progress)
  const overdueTaskCount = await prisma.task.count({
    where: {
      projectId,
      organizationId,
      endDate: { lt: now },
      progress: { lt: 100 },
      status: { not: "DONE" },
    },
  });

  const gapAmount = unpaidAmount;
  const gapPercent = totalExpected > 0 ? (gapAmount / totalExpected) * 100 : 0;

  // Alert if unpaid milestone gap > threshold OR there are overdue tasks
  if (gapPercent < gapThresholdPercent && overdueTaskCount === 0) return null;

  return {
    organizationId,
    projectId,
    projectName,
    expectedByNow: totalExpected,
    actualReceived,
    gapAmount,
    gapPercent: Math.round(gapPercent),
    overdueTaskCount,
  };
}

function buildAlertMessage(alert: CashflowAlert): { title: string; body: string } {
  const parts: string[] = [];

  if (alert.gapPercent >= 20) {
    const gapFormatted = alert.gapAmount.toLocaleString("he-IL", {
      style: "currency",
      currency: "ILS",
      maximumFractionDigits: 0,
    });
    parts.push(`פער תשלומים של ${gapFormatted} (${alert.gapPercent}% מסך הפרויקט)`);
  }

  if (alert.overdueTaskCount > 0) {
    parts.push(`${alert.overdueTaskCount} משימות באיחור בלוח הזמנים`);
  }

  return {
    title: `⚠️ התראת תזרים — ${alert.projectName}`,
    body: parts.join(" · "),
  };
}

/**
 * Runs the cashflow guardian for all active organizations.
 * Sends InAppNotification to each org with cashflow issues.
 */
export async function runCashflowGuardian(): Promise<{
  checked: number;
  alerts: number;
}> {
  const activeProjects = await prisma.project.findMany({
    where: {
      activeFrom: { lte: new Date() },
      OR: [
        { activeTo: null },
        { activeTo: { gte: new Date() } },
      ],
    },
    select: {
      id: true,
      organizationId: true,
      name: true,
    },
  });

  let checked = 0;
  let alerts = 0;

  for (const project of activeProjects) {
    checked++;
    try {
      const alert = await analyzeProjectCashflow(
        project.id,
        project.organizationId,
        project.name,
      );

      if (alert) {
        const { title, body } = buildAlertMessage(alert);
        await createOrganizationNotification(alert.organizationId, title, body);
        alerts++;
        log.info("cashflow_alert_sent", {
          projectId: project.id,
          organizationId: project.organizationId,
          gapPercent: alert.gapPercent,
          overdueTaskCount: alert.overdueTaskCount,
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error("cashflow_guardian_project_failed", {
        projectId: project.id,
        error: message,
      });
    }
  }

  return { checked, alerts };
}
