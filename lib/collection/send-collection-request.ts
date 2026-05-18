import { prisma } from "@/lib/prisma";
import { buildInvoicePdfBuffer } from "@/lib/invoice-export";
import { buildInvoiceExportPayload } from "@/lib/invoice-payload";
import { sendTransactionalEmailWithAttachments } from "@/lib/mail";

export type SendCollectionResult =
  | { ok: true; emailed: boolean }
  | { ok: false; error: string };

export async function sendCollectionRequest(issuedDocumentId: string): Promise<SendCollectionResult> {
  const doc = await prisma.issuedDocument.findUnique({
    where: { id: issuedDocumentId },
    include: {
      organization: {
        select: { name: true, taxId: true, vatRatePercent: true, address: true, paypalMerchantEmail: true },
      },
      contact: { select: { email: true, name: true } },
    },
  });

  if (!doc) {
    return { ok: false, error: "מסמך לא נמצא" };
  }

  const toEmail = doc.contact?.email?.trim();
  if (!toEmail) {
    return { ok: false, error: "אין אימייל ללקוח — עדכנו את איש הקשר ב-CRM" };
  }

  const payload = buildInvoiceExportPayload(doc, doc.organization);
  const pdf = await buildInvoicePdfBuffer(payload);

  const subject = `תזכורת תשלום — ${doc.organization.name}`;
  const inner = `
    <p style="color:#cbd5e1;font-size:15px;">שלום ${doc.contact?.name ?? doc.clientName},</p>
    <p style="color:#94a3b8;font-size:14px;">
      מצורפת תזכורת לגבי מסמך ${doc.type} מס׳ ${doc.number} בסך <strong>${doc.total.toLocaleString("he-IL")} ₪</strong>.
    </p>
    <p style="color:#94a3b8;font-size:14px;">נשמח לסגירת החשבון בהקדם.</p>`;

  const sent = await sendTransactionalEmailWithAttachments(
    toEmail,
    subject,
    inner,
    [
      {
        filename: `invoice-${doc.number}.pdf`,
        content: Buffer.from(pdf),
        contentType: "application/pdf",
      },
    ],
  );

  if (!sent.ok) {
    return { ok: false, error: sent.error };
  }

  await prisma.issuedDocument.update({
    where: { id: doc.id },
    data: {
      lastReminderAt: new Date(),
      reminderCount: { increment: 1 },
    },
  });

  return { ok: true, emailed: true };
}
