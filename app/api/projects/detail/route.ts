import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { getProjectByName } from "@/lib/workspace-api/project-detail";

const querySchema = z.object({
  query: z.string().min(1),
});

export const GET = withWorkspacesAuth(
  async (_req, { orgId }, data) => {
    try {
      const project = await getProjectByName(orgId, data.query);
      return NextResponse.json(project);
    } catch (error) {
      return apiErrorResponse(error, "Project detail GET");
    }
  },
  { schema: querySchema, parseTarget: "query" },
);
