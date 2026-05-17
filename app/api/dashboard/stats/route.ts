import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { getDashboardStats } from "@/lib/workspace-api/dashboard-stats";

export const GET = withWorkspacesAuth(async (_req, { orgId }) => {
  try {
    const stats = await getDashboardStats(orgId);
    return NextResponse.json(stats);
  } catch (error) {
    return apiErrorResponse(error, "Dashboard stats GET");
  }
});
