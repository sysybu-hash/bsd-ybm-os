import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { fetchMeckanoReports } from "@/lib/meckano/reports";
import { meckanoSessionFromWorkspace, requireMeckanoSession } from "@/lib/meckano-route-auth";

export const dynamic = "force-dynamic";

export const GET = withWorkspacesAuth(async (req, ctx): Promise<NextResponse> => {
  try {
    const sessionLike = await meckanoSessionFromWorkspace(ctx);
    const auth = await requireMeckanoSession(sessionLike);
    if ("error" in auth) return auth.error;

    const url = new URL(req.url);
    const startDate =
      url.searchParams.get("startDate") ??
      new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const endDate = url.searchParams.get("endDate") ?? new Date().toISOString().slice(0, 10);
    const locationId = url.searchParams.get("locationId") ?? "all";

    const { reports, summary } = await fetchMeckanoReports(auth.apiKey, {
      startDate,
      endDate,
      employeeId: url.searchParams.get("employeeId") ?? "all",
      projectId: url.searchParams.get("projectId") ?? "all",
      locationId,
    });

    return NextResponse.json({ success: true, rows: reports, summary });
  } catch (error: unknown) {
    return apiErrorResponse(error, "Meckano attendance GET");
  }
});
