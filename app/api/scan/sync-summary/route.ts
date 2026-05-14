import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { jsonBadRequest, jsonUnauthorized } from "@/lib/api-json";
import { prisma } from "@/lib/prisma";
import { getPriceSpikeAlerts } from "@/lib/erp-price-spikes";
import { buildScanSyncSummary, filterAlertsForScan } from "@/lib/scan-sync-summary";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const orgId = session?.user?.organizationId;
  if (!session?.user?.id || !orgId) return jsonUnauthorized();

  const { searchParams } = new URL(req.url);
  const documentId = searchParams.get("documentId")?.trim();
  if (!documentId) return jsonBadRequest("חסר documentId", "missing_document_id");

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
}
