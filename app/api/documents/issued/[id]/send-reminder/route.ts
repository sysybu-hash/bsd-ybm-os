import { NextResponse } from "next/server";
import { withWorkspacesAuthDynamic } from "@/lib/api-handler";
import { jsonNotFound } from "@/lib/api-json";
import { prisma } from "@/lib/prisma";
import { sendCollectionRequest } from "@/lib/collection/send-collection-request";
import {
  issuedDocumentAuditDetails,
  logIssuedDocumentAudit,
} from "@/lib/issued-documents-audit";

export const POST = withWorkspacesAuthDynamic<{ id: string }>(async (_req, { orgId, userId }, segment) => {
  const { id } = await segment.params;
  if (!id) return jsonNotFound("מסמך לא נמצא");

  const doc = await prisma.issuedDocument.findFirst({
    where: { id, organizationId: orgId },
    select: { id: true },
  });
  if (!doc) return jsonNotFound("מסמך לא נמצא");

  const result = await sendCollectionRequest(doc.id);
  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }

  await logIssuedDocumentAudit(
    userId,
    orgId,
    "sent",
    issuedDocumentAuditDetails({ id: doc.id, channel: "collection_reminder" }),
  );

  return NextResponse.json({ success: true, emailed: result.emailed });
});
