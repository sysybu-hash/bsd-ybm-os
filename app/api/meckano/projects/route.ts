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

    const response = await meckanoFetch("tasks", auth.apiKey);
    const data = await response.json();

    if (!data.status) {
      return NextResponse.json(
        { error: data.message || "Meckano API error", details: data },
        { status: 400 },
      );
    }

    const projects = data.data.map((task: Record<string, unknown>) => ({
      id: task.id,
      name: (task.description as string) || (task.comment as string) || `Project ${task.id}`,
    }));

    return NextResponse.json({ success: true, projects });
  } catch (error: unknown) {
    return apiErrorResponse(error, "Meckano Projects Error");
  }
});
