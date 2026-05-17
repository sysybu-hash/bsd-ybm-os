import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { prisma } from "@/lib/prisma";

export const POST = withWorkspacesAuth(async (request, { orgId }) => {
  try {
    const body = await request.json();
    const { documentId, originalAiData, correctedData, correctionSource } = body;

    const correction = await prisma.aICorrection.create({
      data: {
        organizationId: orgId,
        documentId,
        originalAiData: originalAiData || {},
        correctedData: correctedData || {},
        correctionSource: correctionSource || "USER_MANUAL",
      },
    });

    return NextResponse.json({ success: true, id: correction.id });
  } catch (err: unknown) {
    return apiErrorResponse(err, "AI Correction API Error");
  }
});
