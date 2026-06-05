import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { fetchMeckanoReports } from "@/lib/meckano/reports";
import { meckanoSessionFromWorkspace, requireMeckanoSession } from "@/lib/meckano-route-auth";

export const dynamic = "force-dynamic";

const filtersSchema = z.object({
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  employeeId: z.string().default("all"),
  projectId: z.string().default("all"),
  locationId: z.string().default("all"),
});

export const POST = withWorkspacesAuth(async (req, ctx): Promise<NextResponse> => {
  try {
    const sessionLike = await meckanoSessionFromWorkspace(ctx);
    const auth = await requireMeckanoSession(sessionLike);
    if ("error" in auth) return auth.error;

    const body = filtersSchema.parse(await req.json());
    const { reports, summary } = await fetchMeckanoReports(auth.apiKey, body);
    return NextResponse.json({ success: true, reports, summary });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "פילטרים לא תקינים" }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "שגיאה בטעינת דוחות";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
