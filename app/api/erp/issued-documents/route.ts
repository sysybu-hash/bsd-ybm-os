import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { calculateDocumentTotalsFromOrg } from "@/lib/billing-calculations";
import { requiresItaAllocation } from "@/lib/ita-allocation-rules";
import { getApiErrorMessage, resolveApiLocaleFromRequest } from "@/lib/i18n/api-error";
import { requestItaAllocation } from "@/lib/services/ita-service";
import type { DocType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { jsonBadRequest } from "@/lib/api-json";

const issuedDocumentItemSchema = z.object({
  desc: z.string().trim().min(1),
  qty: z.coerce.number().positive(),
  price: z.coerce.number().nonnegative(),
});

const ISSUED_DOC_TYPES = [
  "QUOTE",
  "TRANSACTION_INVOICE",
  "INVOICE",
  "INVOICE_RECEIPT",
  "RECEIPT",
  "CREDIT_NOTE",
  "PURCHASE_ORDER",
] as const satisfies readonly DocType[];

const createIssuedDocumentSchema = z.object({
  type: z.enum(ISSUED_DOC_TYPES),
  clientName: z.string().trim().min(1),
  items: z.array(issuedDocumentItemSchema).min(1),
  /** Manual document number — if omitted, auto MAX+1 for type in org */
  number: z.coerce.number().int().positive().optional(),
  /** Issue date (ISO date or datetime) — defaults to now */
  date: z.string().trim().min(1).optional(),
  dueDate: z.string().trim().min(1).optional(),
  contactId: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1).optional(),
});

const MAX_NUMBER_ALLOC_ATTEMPTS = 3;

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/* ───── GET  — רשימת מסמכים שהונפקו / הצעת מספר הבא ───── */
export const GET = withWorkspacesAuth(async (req, { orgId }) => {
  const url = new URL(req.url);
  const nextFor = url.searchParams.get("nextFor");
  if (nextFor && (ISSUED_DOC_TYPES as readonly string[]).includes(nextFor)) {
    const last = await prisma.issuedDocument.findFirst({
      where: { organizationId: orgId, type: nextFor as DocType },
      orderBy: { number: "desc" },
      select: { number: true },
    });
    return NextResponse.json({ nextNumber: (last?.number ?? 1000) + 1 });
  }

  const docs = await prisma.issuedDocument.findMany({
    where: { organizationId: orgId, deletedAt: null },
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
export const POST = withWorkspacesAuth(async (req, { orgId, userId }, data) => {
  try {
  const apiLocale = resolveApiLocaleFromRequest(req);
  const { type, clientName, items, dueDate, contactId, projectId, number: requestedNumber, date: issueDateRaw } = data as {
    type: DocType;
    clientName: string;
    items: { desc: string; qty: number; price: number }[];
    dueDate?: string;
    contactId?: string;
    projectId?: string;
    number?: number;
    date?: string;
  };

  if (!type || !clientName || !Array.isArray(items) || items.length === 0) {
    return jsonBadRequest("נדרשים type, clientName ולפחות פריט אחד.", "invalid_issued_payload");
  }

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { companyType: true, isReportable: true, vatRatePercent: true, taxId: true },
  });
  if (!org) {
    return jsonBadRequest("ארגון לא נמצא.", "org_not_found");
  }

  const amount = items.reduce((sum, i) => sum + i.qty * i.price, 0);
  const t = calculateDocumentTotalsFromOrg(amount, org, { docType: type });
  const vat = Math.round(t.vat * 100) / 100;
  const total = Math.round(t.total * 100) / 100;
  const docDate = issueDateRaw ? new Date(issueDateRaw) : new Date();
  if (Number.isNaN(docDate.getTime())) {
    return jsonBadRequest("תאריך הנפקה לא תקין.", "invalid_issue_date");
  }

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

  const manualNumber =
    typeof requestedNumber === "number" && Number.isFinite(requestedNumber) && requestedNumber > 0
      ? Math.floor(requestedNumber)
      : null;

  if (manualNumber != null) {
    const taken = await prisma.issuedDocument.findFirst({
      where: { organizationId: orgId, type, number: manualNumber },
      select: { id: true },
    });
    if (taken) {
      return jsonBadRequest(`מספר מסמך ${manualNumber} כבר קיים לסוג זה.`, "document_number_taken");
    }
  }

  let doc = null;
  for (let attempt = 1; attempt <= MAX_NUMBER_ALLOC_ATTEMPTS; attempt += 1) {
    try {
      doc = await prisma.$transaction(async (tx) => {
        let nextNumber = manualNumber;
        if (nextNumber == null) {
          const last = await tx.issuedDocument.findFirst({
            where: { organizationId: orgId, type },
            orderBy: { number: "desc" },
            select: { number: true },
          });
          nextNumber = (last?.number ?? 1000) + 1;
        }

        return tx.issuedDocument.create({
          data: {
            type,
            number: nextNumber,
            date: docDate,
            clientName,
            amount,
            vat,
            total,
            items: items as unknown as object,
            dueDate: dueDate ? new Date(dueDate) : undefined,
            organizationId: orgId,
            contactId: resolvedContactId ?? null,
            projectId: resolvedProjectId ?? null,
            createdByUserId: userId,
          },
        });
      });
      break;
    } catch (error) {
      if (manualNumber != null && isUniqueConstraintError(error)) {
        return jsonBadRequest(`מספר מסמך ${manualNumber} כבר קיים לסוג זה.`, "document_number_taken");
      }
      if (!isUniqueConstraintError(error) || attempt === MAX_NUMBER_ALLOC_ATTEMPTS) {
        throw error;
      }
    }
  }

  if (!doc) {
    return jsonBadRequest(
      getApiErrorMessage("document_number_allocation_failed", apiLocale),
      "document_number_allocation_failed",
    );
  }

  let itaAllocationNumber: string | null = null;
  let itaIsMock = false;
  let itaSkippedWithoutAllocation = false;
  if (requiresItaAllocation(type, amount, docDate)) {
    const ita = await requestItaAllocation(amount, org.taxId ?? "", doc.id, {
      docType: type,
      asOf: docDate,
    });
    if (!ita.success) {
      await prisma.issuedDocument.delete({ where: { id: doc.id } }).catch(() => undefined);
      return NextResponse.json(
        {
          error: getApiErrorMessage(ita.errorKey ?? "ita_allocation_failed", apiLocale),
          code: "ita_allocation_required",
          itaIsMock: false,
          thresholdNis: ita.thresholdNis,
        },
        { status: 422 },
      );
    }
    if (ita.allocationNumber) {
      itaAllocationNumber = ita.allocationNumber;
      itaIsMock = ita.isMock;
      doc = await prisma.issuedDocument.update({
        where: { id: doc.id },
        data: { itaAllocationNumber },
      });
    } else {
      // ITA לא מחובר עדיין — המסמך נשמר בלי מספר הקצאה
      itaSkippedWithoutAllocation = Boolean(ita.skipped);
    }
  }

  revalidatePath("/app/erp");
  revalidatePath("/app/crm");
  if (resolvedContactId) {
    revalidatePath(`/app/crm/client/${resolvedContactId}`);
  }

  const { logIssuedDocumentAudit, issuedDocumentAuditDetails } = await import(
    "@/lib/issued-documents-audit"
  );
  await logIssuedDocumentAudit(
    userId,
    orgId,
    "created",
    issuedDocumentAuditDetails({
      id: doc.id,
      type: doc.type,
      number: doc.number,
      clientName: doc.clientName,
      total: doc.total,
      projectId: resolvedProjectId,
      contactId: resolvedContactId,
    }),
  );

  return NextResponse.json(
    {
      document: doc,
      itaAllocationNumber,
      itaIsMock,
      itaSkippedWithoutAllocation,
    },
    { status: 201 },
  );
  } catch (error) {
    return apiErrorResponse(error, "issued-documents POST");
  }
}, { schema: createIssuedDocumentSchema });
