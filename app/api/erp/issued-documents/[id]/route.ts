import { NextResponse } from "next/server";
import { CompanyType, DocStatus, DocType } from "@prisma/client";
import { calculateDocumentTotalsFromOrg } from "@/lib/billing-calculations";
import { prisma } from "@/lib/prisma";
import { jsonNotFound } from "@/lib/api-json";
import { withWorkspacesAuthDynamic } from "@/lib/api-handler";

type ItemInput = {
  desc?: unknown;
  qty?: unknown;
  price?: unknown;
};

function numberOrZero(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = Number.parseFloat(value.replace(/[^\d.-]/g, ""));
    return Number.isFinite(normalized) ? normalized : 0;
  }
  return 0;
}

function normalizeItems(raw: unknown) {
  if (!Array.isArray(raw)) return null;
  const items = raw
    .map((item) => {
      const source = item as ItemInput;
      const desc = typeof source?.desc === "string" ? source.desc.trim() : "";
      const qty = numberOrZero(source?.qty);
      const price = numberOrZero(source?.price);
      if (!desc) return null;
      return {
        desc,
        qty: qty > 0 ? qty : 1,
        price: price >= 0 ? price : 0,
      };
    })
    .filter((item): item is { desc: string; qty: number; price: number } => item !== null);

  return items.length > 0 ? items : null;
}

function totalsFromItems(
  items: Array<{ qty: number; price: number }>,
  org: { companyType: CompanyType; isReportable: boolean; vatRatePercent: number | null },
  docType: DocType,
) {
  const amount = items.reduce((sum, item) => sum + item.qty * item.price, 0);
  const t = calculateDocumentTotalsFromOrg(amount, org, { docType });
  return {
    amount,
    vat: Math.round(t.vat * 100) / 100,
    total: Math.round(t.total * 100) / 100,
  };
}

export const PATCH = withWorkspacesAuthDynamic<{ id: string }>(
  async (req, { orgId }, { params }) => {
    const { id } = await params;
    const body = (await req.json()) as {
      type?: string;
      clientName?: string;
      status?: string;
      date?: string | null;
      dueDate?: string | null;
      items?: unknown;
      contactId?: string | null;
    };

    const existing = await prisma.issuedDocument.findFirst({
      where: { id, organizationId: orgId },
      select: {
        id: true,
        type: true,
        items: true,
        amount: true,
        vat: true,
        total: true,
        contactId: true,
      },
    });

    if (!existing) {
      return jsonNotFound("מסמך לא נמצא");
    }

    const type = typeof body.type === "string" && Object.values(DocType).includes(body.type as DocType)
      ? (body.type as DocType)
      : undefined;
    const status = typeof body.status === "string" && Object.values(DocStatus).includes(body.status as DocStatus)
      ? (body.status as DocStatus)
      : undefined;
    const clientName = typeof body.clientName === "string" ? body.clientName.trim() : undefined;
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { companyType: true, isReportable: true, vatRatePercent: true },
    });
    if (!org) {
      return jsonNotFound("ארגון לא נמצא");
    }

    const items = normalizeItems(body.items);
    const docTypeForTotals = type ?? existing.type;
    const totals = items ? totalsFromItems(items, org, docTypeForTotals) : null;

    let contactId: string | null | undefined = undefined;
    if (body.contactId === null || body.contactId === "") {
      contactId = null;
    } else if (typeof body.contactId === "string" && body.contactId.trim().length > 0) {
      const contact = await prisma.contact.findFirst({
        where: { id: body.contactId.trim(), organizationId: orgId },
        select: { id: true },
      });
      if (!contact) {
        return jsonNotFound("איש קשר לא נמצא");
      }
      contactId = contact.id;
    }

    const updated = await prisma.issuedDocument.update({
      where: { id },
      data: {
        type,
        clientName: clientName && clientName.length > 0 ? clientName : undefined,
        status,
        date: body.date ? new Date(body.date) : undefined,
        dueDate: body.dueDate === null || body.dueDate === "" ? null : body.dueDate ? new Date(body.dueDate) : undefined,
        items: items ?? undefined,
        amount: totals?.amount ?? undefined,
        vat: totals?.vat ?? undefined,
        total: totals?.total ?? undefined,
        contactId,
      },
    });

    return NextResponse.json({ document: updated });
  },
);

export const DELETE = withWorkspacesAuthDynamic<{ id: string }>(
  async (_req, { orgId }, { params }) => {
    const { id } = await params;
    const existing = await prisma.issuedDocument.findFirst({
      where: { id, organizationId: orgId },
      select: { id: true },
    });

    if (!existing) {
      return jsonNotFound("מסמך לא נמצא");
    }

    await prisma.issuedDocument.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  },
);
