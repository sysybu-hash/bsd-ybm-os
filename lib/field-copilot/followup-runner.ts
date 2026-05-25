import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const log = createLogger("field-copilot-followup");

const REMINDER_DAYS = [3, 7] as const;

export async function runFieldCopilotFollowupsForAllOrganizations(): Promise<{
  processed: number;
  notified: number;
}> {
  let processed = 0;
  let notified = 0;

  for (const days of REMINDER_DAYS) {
    const cutoffStart = new Date();
    cutoffStart.setDate(cutoffStart.getDate() - days);
    cutoffStart.setHours(0, 0, 0, 0);
    const cutoffEnd = new Date(cutoffStart);
    cutoffEnd.setDate(cutoffEnd.getDate() + 1);

    const sessions = await prisma.fieldCopilotSession.findMany({
      where: {
        status: "HANDED_OFF",
        quoteId: { not: null },
        handedOffAt: { gte: cutoffStart, lt: cutoffEnd },
      },
      include: {
        user: { select: { id: true } },
        organization: { select: { id: true } },
      },
      take: 100,
    });

    for (const session of sessions) {
      processed += 1;
      if (!session.quoteId) continue;

      const quote = await prisma.quote.findFirst({
        where: { id: session.quoteId, status: "PENDING" },
      });
      if (!quote) continue;

      const title =
        days === 3
          ? "הצעת מחיר ממתינה — 3 ימים"
          : "הצעת מחיר ממתינה — שבוע";
      const body = session.contactName
        ? `הצעה ללקוח ${session.contactName} עדיין ממתינה לחתימה`
        : "הצעת מחיר מהשטח עדיין ממתינה לחתימה";

      const existing = await prisma.inAppNotification.findFirst({
        where: {
          userId: session.userId,
          title,
          createdAt: { gte: cutoffStart },
        },
      });
      if (existing) continue;

      await prisma.inAppNotification.create({
        data: {
          userId: session.userId,
          title,
          body,
          linkType: "docCreator",
          targetId: session.issuedDocumentId ?? session.quoteId,
          metadata: {
            quoteId: session.quoteId,
            sessionId: session.id,
            fieldCopilot: true,
            reminderDay: days,
          },
        },
      });
      notified += 1;
    }
  }

  log.info("followup run complete", { processed, notified });
  return { processed, notified };
}
