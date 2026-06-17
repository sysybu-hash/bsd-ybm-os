import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { jsonBadRequest } from "@/lib/api-json";
import {
  createProgressBillPortal,
  mapProgressBillPortalRow,
} from "@/lib/progress-bills/progress-bill-portal";
import { requireProjectForOrg } from "@/lib/projects/project-access";
import { createProgressBillSchema } from "@/lib/validation/schemas/progress-bill-portal";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const GET = withWorkspacesAuth(
  async (req, { orgId }) => {
    try {
      const status = new URL(req.url).searchParams.get("status") ?? undefined;
      const projectId = new URL(req.url).searchParams.get("projectId") ?? undefined;

      const bills = await prisma.progressBill.findMany({
        where: {
          organizationId: orgId,
          ...(status ? { status } : {}),
          ...(projectId ? { projectId } : {}),
        },
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        include: { project: { select: { name: true } } },
      });

      return NextResponse.json({
        bills: bills.map(mapProgressBillPortalRow),
      });
    } catch (error) {
      return apiErrorResponse(error, "Progress bills GET");
    }
  },
  { rateLimit: { key: "progress-bills:list", limit: 30, windowMs: 60_000 } },
);

export const POST = withWorkspacesAuth(
  async (req, { orgId }) => {
    try {
      const body: unknown = await req.json();
      const parsed = createProgressBillSchema.safeParse(body);
      if (!parsed.success) {
        return jsonBadRequest("גוף הבקשה לא תקין");
      }

      const gate = await requireProjectForOrg(parsed.data.projectId, orgId);
      if (!gate.ok) return gate.response;

      const created = await createProgressBillPortal({
        organizationId: orgId,
        projectId: parsed.data.projectId,
        contractorName: parsed.data.contractorName,
        amount: parsed.data.amount,
        completionPercent: parsed.data.completionPercent,
        submit: parsed.data.submit,
      });

      return NextResponse.json({
        bill: mapProgressBillPortalRow(created),
      });
    } catch (error) {
      return apiErrorResponse(error, "Progress bills POST");
    }
  },
  { rateLimit: { key: "progress-bills:create", limit: 20, windowMs: 60_000 } },
);
