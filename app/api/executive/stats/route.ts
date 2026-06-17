import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { getExecutiveStats } from "@/lib/executive/executive-stats";

export const dynamic = "force-dynamic";

export const GET = withWorkspacesAuth(
  async (_req, { orgId }) => {
    try {
      const stats = await getExecutiveStats(orgId);
      return NextResponse.json(stats);
    } catch (error) {
      return apiErrorResponse(error, "Executive stats GET");
    }
  },
  { rateLimit: { key: "executive:stats", limit: 30, windowMs: 60_000 } },
);
