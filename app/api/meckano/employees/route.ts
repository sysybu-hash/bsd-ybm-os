import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { meckanoFetch } from "@/lib/meckano-fetch";
import { meckanoSessionFromWorkspace, requireMeckanoSession } from "@/lib/meckano-route-auth";

export const GET = withWorkspacesAuth(async (_req, ctx): Promise<NextResponse> => {
  try {
    const sessionLike = await meckanoSessionFromWorkspace(ctx);
    const auth = await requireMeckanoSession(sessionLike);
    if ("error" in auth) return auth.error;

    const response = await meckanoFetch("users", auth.apiKey);
    const data = await response.json();

    if (!data.status) {
      return NextResponse.json(
        { error: data.message || "Meckano API error", details: data },
        { status: 400 },
      );
    }

    const employees = data.data.map((user: Record<string, unknown>) => ({
      id: user.id,
      name:
        `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
        (user.workerTag as string) ||
        (user.email as string),
      email: user.email,
      phone: user.phone,
      department:
        (user.department as { name?: string } | undefined)?.name || "ללא מחלקה",
    }));

    return NextResponse.json({ success: true, employees });
  } catch (error: unknown) {
    return apiErrorResponse(error, "Meckano Employees Error");
  }
});
