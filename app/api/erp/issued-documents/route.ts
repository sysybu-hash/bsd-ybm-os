import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { calculateIssuedDocumentTotals } from "@/lib/billing-calculations";
import { prisma } from "@/lib/prisma";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { jsonBadRequest } from "@/lib/api-json";

const issuedDocumentItemSchema = z.object({
  desc: z.string().trim().min(1),
  qty: z.coerce.number().positive(),
  price: z.coerce.number().nonnegative(),
});

const createIssuedDocumentSchema = z.object({
  type: z.enum(["INVOICE", "RECEIPT", "INVOICE_RECEIPT", "CREDIT_NOTE"]),
  clientName: z.string().trim().min(1),
  items: z.array(issuedDocumentItemSchema).min(1),
  dueDate: z.string().trim().min(1).optional(),
  contactId: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1).optional(),
});

const MAX_NUMBER_ALLOC_ATTEMPTS = 3;

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/* ───── GET  — רשימת מסמכים שהונפקו ───── */
export const GET = withWorkspacesAuth(async (_req, { orgId }) => {
  const docs = await prisma.issuedDocument.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, type: true, number: true, date: true, dueDate: true,
      clientName: true, amount: true, vat: true, total: true,
      status: true, items: true, contactId: true, createdAt: true, updatedAt: true,
    },
  });

  return NextResponse.json({ documents: docs });
});

/* ───── POST — הנפקת מסמך חדש (חשבונית / קבלה / חש״ק / זיכוי) ───── */
export const POST = withWorkspacesAuth(async (_req, { orgId }, data) => {
  const { type, clientName, items, dueDate, contactId, projectId } = data as {
    type: "INVOICE" | "RECEIPT" | "INVOICE_RECEIPT" | "CREDIT_NOTE";
    clientName: string;
    items: { desc: string; qty: number; price: number }[];
    dueDate?: string;
    contactId?: string;
    projectId?: string;
  };

  if (!type || !clientName || !Array.isArray(items) || items.length === 0) {
    return jsonBadRequest("נדרשים type, clientName ולפחות פריט אחד.", "invalid_issued_payload");
  }

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { companyType: true, isReportable: true },
  });
  if (!org) {
    return jsonBadRequest("ארגון לא נמצא.", "org_not_found");
  }

  const amount = items.reduce((sum, i) => sum + i.qty * i.price, 0);
  const t = calculateIssuedDocumentTotals(amount, org.companyType, org.isReportable);
  const vat = Math.round(t.vat * 100) / 100;
  const total = Math.round(t.total * 100) / 100;

  /* מספר רץ — MAX(number) + 1 לסוג מסמך בתוך הארגון */
  /* אם נשלח contactId — וודא שהוא שייך לאותו ארגון */
  let resolvedContactId: string | undefined;
  if (contactId) {
    const contact = await prisma.contact.findFirst({
      where: { id: contactId, organizationId: orgId },
      select: { id: true },
    });
    resolvedContactId = contact?.id;
  }

  let resolvedProjectId: string | undefined;
  if (projectId) {
    const project = await prisma.project.findFirst({
      where: { id: projectId, organizationId: orgId },
      select: { id: true },
    });
    resolvedProjectId = project?.id;
  }

  let doc = null;
  for (let attempt = 1; attempt <= MAX_NUMBER_ALLOC_ATTEMPTS; attempt += 1) {
    try {
      doc = await prisma.$transaction(async (tx) => {
        const last = await tx.issuedDocument.findFirst({
          where: { organizationId: orgId, type },
          orderBy: { number: "desc" },
          select: { number: true },
        });
        const nextNumber = (last?.number ?? 1000) + 1;

        return tx.issuedDocument.create({
          data: {
            type,
            number: nextNumber,
            clientName,
            amount,
            vat,
            total,
            items: items as unknown as object,
            dueDate: dueDate ? new Date(dueDate) : undefined,
            organizationId: orgId,
            contactId: resolvedContactId ?? null,
            projectId: resolvedProjectId ?? null,
          },
        });
      });
      break;
    } catch (error) {
      if (!isUniqueConstraintError(error) || attempt === MAX_NUMBER_ALLOC_ATTEMPTS) {
        throw error;
      }
    }
  }

  if (!doc) {
    return jsonBadRequest("לא ניתן היה להקצות מספר מסמך.", "document_number_allocation_failed");
  }

  revalidatePath("/app/erp");
  revalidatePath("/app/crm");
  if (resolvedContactId) {
    revalidatePath(`/app/crm/client/${resolvedContactId}`);
  }

  return NextResponse.json({ document: doc }, { status: 201 });
}, { schema: createIssuedDocumentSchema });
