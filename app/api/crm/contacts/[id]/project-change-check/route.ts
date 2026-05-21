import { NextResponse } from "next/server";
import { withWorkspacesAuthDynamic } from "@/lib/api-handler";
import { evaluateContactProjectChange } from "@/lib/workspace-api/project-crm-sync";

export const GET = withWorkspacesAuthDynamic<{ id: string }>(async (req, { orgId }, segment) => {
  const { id } = await segment.params;
  const url = new URL(req.url);
  const nextRaw = url.searchParams.get("nextProjectId");
  const nextProjectId = nextRaw && nextRaw.length > 0 ? nextRaw : null;

  const result = await evaluateContactProjectChange(id, nextProjectId, orgId);
  return NextResponse.json(result);
});
