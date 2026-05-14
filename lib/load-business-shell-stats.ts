import { prisma } from "@/lib/prisma";

/** אחוזים לתצוגת בריאות מרכז עסקי — מבוסס נתונים אמיתיים (לא ערכי placeholder). */
export async function loadBusinessShellStats(organizationId: string): Promise<{
  dataCoveragePct: number;
  opsFlowPct: number;
}> {
  const [docCount, contactCount, issuedTotal, issuedPending] = await Promise.all([
    prisma.document.count({ where: { organizationId } }),
    prisma.contact.count({ where: { organizationId } }),
    prisma.issuedDocument.count({ where: { organizationId } }),
    prisma.issuedDocument.count({
      where: { organizationId, status: "PENDING" },
    }),
  ]);

  const dataCoveragePct = Math.min(
    100,
    Math.round(
      12 +
        Math.min(38, docCount * 3 + contactCount * 2) +
        (issuedTotal > 0 ? 25 : 0) +
        (docCount > 0 && contactCount > 0 ? 15 : 0),
    ),
  );

  const opsFlowPct =
    issuedTotal === 0
      ? Math.min(100, 35 + Math.min(40, docCount * 2))
      : Math.max(
          25,
          Math.min(100, Math.round(100 - (issuedPending / Math.max(1, issuedTotal)) * 45)),
        );

  return { dataCoveragePct, opsFlowPct };
}
