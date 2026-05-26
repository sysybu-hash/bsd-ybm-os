import type { NextRequest } from "next/server";
import { withWorkspacesAuthDynamic } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { jsonNotFound } from "@/lib/api-json";
import { buildContactTimeline } from "@/lib/crm/contact-timeline";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export const GET = withWorkspacesAuthDynamic<{ id: string }>(async (req, { orgId }, segment) => {
  const limited = await applyRateLimit(req as NextRequest, "crm:contact-timeline", 60, 60_000);
  if (limited) return limited;

  const { id } = await segment.params;
  try {
    const exists = await prisma.contact.findFirst({
      where: { id, organizationId: orgId },
      select: { id: true },
    });
    if (!exists) return jsonNotFound("לא נמצא");

    const events = await buildContactTimeline(id, orgId);
    return NextResponse.json({ events });
  } catch (err: unknown) {
    return apiErrorResponse(err, "api/crm/contacts/timeline");
  }
});
