"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import type { DocType } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readRequestMessages } from "@/lib/i18n/server-messages";
import { getIndustryProfile } from "@/lib/professions/runtime";
import { templateDraftMode } from "@/lib/professional-template-draft";

export type DraftIssuedPayload = {
  id: string;
  type: string;
  number: number;
  date: string;
  dueDate: string | null;
  clientName: string;
  amount: number;
  vat: number;
  total: number;
  status: string;
  items: Array<{ desc?: string; qty?: number; price?: number }>;
  contactId: string | null;
};

export async function createDraftFromProfessionalTemplateAction(templateId: string): Promise<
  | { ok: true; mode: "issue"; docType: DocType }
  | { ok: true; mode: "created"; issued: DraftIssuedPayload }
  | { ok: false; error: string }
> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { ok: false, error: "נדרשת התחברות" };
  }
  const orgId = session.user.organizationId ?? null;
  if (!orgId) {
    return { ok: false, error: "אין ארגון משויך" };
  }

  const organization = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      industry: true,
      constructionTrade: true,
      industryConfigJson: true,
    },
  });

  const messages = await readRequestMessages();
  const profile = getIndustryProfile(
    organization?.industry ?? "CONSTRUCTION",
    organization?.industryConfigJson,
    organization?.constructionTrade,
    messages,
  );

  const template = profile.templates.find((t) => t.id === templateId);
  if (!template) {
    return { ok: false, error: "תבנית לא נמצאה בפרופיל המקצועי" };
  }

  const mode = templateDraftMode(template);
  if (mode === "issue" && template.issuedDocumentType) {
    return { ok: true, mode: "issue", docType: template.issuedDocumentType };
  }

  const docType: DocType = "INVOICE";
  const last = await prisma.issuedDocument.findFirst({
    where: { organizationId: orgId, type: docType },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  const nextNumber = (last?.number ?? 1000) + 1;

  const created = await prisma.issuedDocument.create({
    data: {
      type: docType,
      number: nextNumber,
      clientName: `טיוטה · ${template.label}`,
      amount: 0,
      vat: 0,
      total: 0,
      items: [
        {
          desc: template.description,
          qty: 1,
          price: 0,
          professionalTemplateId: template.id,
          professionalTemplateKind: template.kind,
        },
      ] as unknown as object,
      status: "PENDING",
      organizationId: orgId,
    },
    select: {
      id: true,
      type: true,
      number: true,
      date: true,
      dueDate: true,
      clientName: true,
      amount: true,
      vat: true,
      total: true,
      status: true,
      items: true,
      contactId: true,
    },
  });

  const itemsRaw = Array.isArray(created.items) ? created.items : [];
  const items = itemsRaw.map((row) => {
    const r = row as { desc?: string; qty?: number; price?: number };
    return { desc: r.desc, qty: r.qty, price: r.price };
  });

  revalidatePath("/app/documents");
  revalidatePath("/app/finance");

  return {
    ok: true,
    mode: "created",
    issued: {
      id: created.id,
      type: created.type,
      number: created.number,
      date: created.date.toISOString(),
      dueDate: created.dueDate?.toISOString() ?? null,
      clientName: created.clientName,
      amount: created.amount,
      vat: created.vat,
      total: created.total,
      status: created.status,
      items,
      contactId: created.contactId,
    },
  };
}
