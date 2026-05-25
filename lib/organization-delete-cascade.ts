import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Tx = Prisma.TransactionClient;

/** מחיקת ארגון וכל הנתונים התלויים — משותף לניהול מנויים ולהסרת הרשמות ממתינות. */
export async function deleteOrganizationCascade(
  organizationId: string,
  tx?: Tx,
): Promise<void> {
  const run = async (client: Tx) => {
    await client.activityLog.deleteMany({ where: { organizationId } });
    await client.productPriceObservation.deleteMany({ where: { organizationId } });
    await client.documentLineItem.deleteMany({ where: { organizationId } });
    await client.documentScanCache.deleteMany({ where: { organizationId } });
    await client.quote.deleteMany({ where: { organizationId } });
    await client.issuedDocument.deleteMany({ where: { organizationId } });
    await client.invoice.deleteMany({ where: { organizationId } });
    await client.financialInsight.deleteMany({ where: { organizationId } });
    await client.cloudIntegration.deleteMany({ where: { organizationId } });
    await client.meckanoZone.deleteMany({ where: { organizationId } });
    await client.organizationInvite.deleteMany({ where: { organizationId } });
    await client.project.deleteMany({ where: { organizationId } });
    await client.contact.deleteMany({ where: { organizationId } });
    await client.document.deleteMany({ where: { organizationId } });
    await client.user.deleteMany({ where: { organizationId } });
    await client.organization.delete({ where: { id: organizationId } });
  };

  if (tx) {
    await run(tx);
    return;
  }
  await prisma.$transaction(run);
}
