"use server";

import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { extractAiDataFromScanJobResult } from "@/lib/scan-job-result";
import { persistDocumentLineItemsFromAiData } from "@/lib/persist-document-lines";
import { saveScannedDocumentSchema } from "@/lib/validation/save-scanned-document";

export type SaveScanResult = {
  success: boolean;
  error?: string;
  documentId?: string;
};

function extractVendorContactInfo(aiData: Record<string, unknown>): {
  email: string | null;
  phone: string | null;
} {
  const meta = aiData.metadata;
  const metaObj =
    meta && typeof meta === "object" && !Array.isArray(meta)
      ? (meta as Record<string, unknown>)
      : null;
  const vendorObj =
    aiData.vendorDetails && typeof aiData.vendorDetails === "object" && !Array.isArray(aiData.vendorDetails)
      ? (aiData.vendorDetails as Record<string, unknown>)
      : null;

  const pick = (...keys: string[]): string | null => {
    for (const src of [metaObj, vendorObj, aiData]) {
      if (!src) continue;
      for (const k of keys) {
        const v = src[k];
        if (typeof v === "string" && v.trim()) return v.trim();
      }
    }
    return null;
  };

  const emailRaw = pick("vendorEmail", "supplierEmail", "email");
  const phoneRaw = pick("vendorPhone", "supplierPhone", "phone", "telephone");
  const email = emailRaw && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw) ? emailRaw : null;
  const phone = phoneRaw ? phoneRaw.replace(/[^\d+\-\s()]/g, "").trim() || null : null;
  return { email, phone };
}

async function resolveCrmContactId(
  orgId: string,
  aiData: Record<string, unknown>,
  explicitContactId?: string,
): Promise<string | undefined> {
  if (explicitContactId?.trim()) {
    const found = await prisma.contact.findFirst({
      where: { id: explicitContactId.trim(), organizationId: orgId },
      select: { id: true },
    });
    return found?.id;
  }

  const meta = aiData.metadata;
  const clientFromMeta =
    meta && typeof meta === "object" && !Array.isArray(meta)
      ? (meta as Record<string, unknown>).client
      : null;
  const nameRaw =
    (typeof clientFromMeta === "string" && clientFromMeta.trim()) ||
    (typeof aiData.vendor === "string" && aiData.vendor.trim()) ||
    "";
  if (!nameRaw) return undefined;

  const { email, phone } = extractVendorContactInfo(aiData);

  const existing = await prisma.contact.findFirst({
    where: { organizationId: orgId, name: nameRaw },
    select: { id: true, email: true, phone: true },
  });
  if (existing) {
    const patch: { email?: string; phone?: string } = {};
    if (!existing.email && email) patch.email = email;
    if (!existing.phone && phone) patch.phone = phone;
    if (Object.keys(patch).length > 0) {
      await prisma.contact.update({ where: { id: existing.id }, data: patch });
    }
    return existing.id;
  }

  const created = await prisma.contact.create({
    data: {
      organizationId: orgId,
      name: nameRaw,
      email: email ?? undefined,
      phone: phone ?? undefined,
      status: "LEAD",
      notes: "נוצר אוטומטית מייצוא סריקה ל-CRM",
    },
    select: { id: true },
  });
  return created.id;
}

/**
 * שומר מסמך סריקה ל-ERP/CRM. אפשר למסור scanJobId (תור) כדי למשוך תוצאה מה-DB.
 */
export async function saveScannedDocumentAction(
  fileName: string,
  aiData: Record<string, unknown>,
  targetModule: "ERP" | "CRM",
  contactId?: string,
  scanJobId?: string,
): Promise<SaveScanResult> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return { success: false, error: "Unauthorized" };

    const userId = session.user.id;
    const orgId = session.user.organizationId;
    if (!orgId) return { success: false, error: "No organization found" };

    const parsed = saveScannedDocumentSchema.safeParse({
      fileName,
      targetModule,
      contactId,
      scanJobId,
      aiData: Object.keys(aiData).length ? aiData : undefined,
    });
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ");
      return { success: false, error: msg || "נתונים לא תקינים" };
    }

    let effectiveFileName = parsed.data.fileName;
    let effectiveAi: Record<string, unknown> = { ...aiData };

    if (parsed.data.scanJobId) {
      const job = await prisma.documentScanJob.findFirst({
        where: {
          id: parsed.data.scanJobId,
          userId,
          organizationId: orgId,
          status: "COMPLETED",
        },
        select: { result: true, fileData: true },
      });
      if (!job?.result) {
        return { success: false, error: "משימת סריקה לא נמצאה או לא הושלמה" };
      }

      const extracted = extractAiDataFromScanJobResult(job.result);
      if (!extracted) {
        return { success: false, error: "לא ניתן לפענח תוצאת סריקה" };
      }
      if (extracted.alreadyExportedDocumentId) {
        return { success: true, documentId: extracted.alreadyExportedDocumentId };
      }
      if (!Object.keys(extracted.aiData).length) {
        return { success: false, error: "תוצאת סריקה ריקה" };
      }
      effectiveAi = extracted.aiData;
      if (!effectiveFileName?.trim()) {
        effectiveFileName = fileName || "scan-export";
      }
    }

    const crmContactId =
      targetModule === "CRM"
        ? await resolveCrmContactId(orgId, effectiveAi, parsed.data.contactId)
        : undefined;

    let crmNotesBaseline = "";
    if (crmContactId) {
      const row = await prisma.contact.findUnique({
        where: { id: crmContactId },
        select: { notes: true },
      });
      crmNotesBaseline = row?.notes?.trim() ?? "";
    }

    const doc = await prisma.document.create({
      data: {
        fileName: effectiveFileName,
        type: String(effectiveAi.docType || "UNKNOWN"),
        status: "PROCESSED",
        aiData: effectiveAi as Prisma.InputJsonValue,
        userId,
        organizationId: orgId,
      },
    });

    if (crmContactId) {
      const stamp = `\n[סריקה] ${effectiveFileName} · מזהה מסמך ${doc.id}`;
      await prisma.contact.update({
        where: { id: crmContactId },
        data: {
          notes: `${crmNotesBaseline}${stamp}`.trim().slice(0, 65000),
        },
      });
    }

    await persistDocumentLineItemsFromAiData(
      doc.id,
      orgId,
      typeof effectiveAi.vendor === "string" ? effectiveAi.vendor : null,
      effectiveAi,
      {
        skipPriceObservations: false,
        notifyUserId: userId,
        fileLabel: effectiveFileName,
        skipNotification: false,
      },
    );

    const lineItems = (effectiveAi.lineItems || []) as Array<Record<string, unknown>>;
    const supplier = String(effectiveAi.vendor || "ספק כללי");

    for (const item of lineItems) {
      const desc =
        (typeof item.description === "string" && item.description) ||
        (typeof item.desc === "string" && item.desc) ||
        "";
      const price =
        (typeof item.unitPrice === "number" && item.unitPrice) ||
        (typeof item.price === "number" && item.price) ||
        (typeof item.lineTotal === "number" && item.lineTotal ? item.lineTotal : null);
      if (!desc || price == null || !(price > 0)) continue;

      const hist = await prisma.productPriceObservation.findFirst({
        where: {
          organizationId: orgId,
          supplierName: supplier,
          description: desc,
        },
        orderBy: { observedAt: "desc" },
      });

      if (hist && price > hist.unitPrice * 1.2) {
        await prisma.inAppNotification.create({
          data: {
            userId,
            title: "חריגת מחיר זוהתה!",
            body: `המוצר "${desc}" של "${supplier}" התייקר ב-${Math.round((price / hist.unitPrice - 1) * 100)}% לעומת קנייה קודמת.`,
          },
        });
      }
    }

    if (parsed.data.scanJobId) {
      const prev = await prisma.documentScanJob.findFirst({
        where: { id: parsed.data.scanJobId },
        select: { result: true },
      });
      const base =
        prev?.result && typeof prev.result === "object" && !Array.isArray(prev.result)
          ? (prev.result as Record<string, unknown>)
          : {};
      await prisma.documentScanJob.update({
        where: { id: parsed.data.scanJobId },
        data: {
          result: {
            ...base,
            _exportedToDocumentId: doc.id,
            _exportedAt: new Date().toISOString(),
            _exportedTarget: targetModule,
          } as Prisma.InputJsonValue,
        },
      });
    }

    revalidatePath("/app/documents/erp");
    revalidatePath("/app/clients");
    revalidatePath("/app/documents");
    revalidatePath("/app/inbox");

    return { success: true, documentId: doc.id };
  } catch (e: unknown) {
    console.error("Failed to save scanned document:", e);
    const msg = e instanceof Error ? e.message : "Failed to save";
    return { success: false, error: msg };
  }
}
