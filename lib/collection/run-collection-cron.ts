import { prisma } from "@/lib/prisma";
import { sendCollectionRequest } from "@/lib/collection/send-collection-request";

export async function runCollectionRemindersCron(): Promise<{ sent: number; skipped: number }> {
  const now = new Date();
  const docs = await prisma.issuedDocument.findMany({
    where: {
      status: "PENDING",
      dueDate: { lt: now },
      contactId: { not: null },
    },
    include: { contact: { select: { email: true } } },
    take: 50,
  });

  let sent = 0;
  let skipped = 0;

  for (const doc of docs) {
    if (!doc.contact?.email?.trim()) {
      skipped += 1;
      continue;
    }
    const result = await sendCollectionRequest(doc.id);
    if (result.ok) sent += 1;
    else skipped += 1;
  }

  return { sent, skipped };
}
