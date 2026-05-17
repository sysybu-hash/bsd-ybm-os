import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { jsonBadRequest } from "@/lib/api-json";
import { prisma } from "@/lib/prisma";
import { getPriceSpikeAlerts } from "@/lib/erp-price-spikes";
import { buildScanSyncSummary, filterAlertsForScan } from "@/lib/scan-sync-summary";

export const dynamic = "force-dynamic";

const syncSummaryQuerySchema = z.object({
  documentId: z.string().min(1),
});

export const GET = withWorkspacesAuth(
  async (_req, { orgId }, data) => {
    const documentId = data.documentId.trim();

    const doc = await prisma.document.findFirst({
      where: { id: documentId, organizationId: orgId },
      select: { id: true, aiData: true },
    });
    if (!doc) return jsonBadRequest("מסמך לא נמצא", "document_not_found");

    const aiData =
      doc.aiData && typeof doc.aiData === "object" && !Array.isArray(doc.aiData)
        ? (doc.aiData as Record<string, unknown>)
        : {};

    const allAlerts = await getPriceSpikeAlerts(orgId, 32);
    const alerts = filterAlertsForScan(allAlerts, aiData);

    const vendorName =
      typeof aiData.vendor === "string" && aiData.vendor.trim() ? aiData.vendor.trim() : null;
    const contact = vendorName
      ? await prisma.contact.findFirst({
          where: { organizationId: orgId, name: vendorName },
          select: { id: true },
        })
      : null;

    const summary = await buildScanSyncSummary({
      organizationId: orgId,
      documentId: doc.id,
      aiData,
      alerts,
      contactId: contact?.id ?? null,
    });

    return NextResponse.json({ summary });
  },
  { schema: syncSummaryQuerySchema, parseTarget: "query" },
);
