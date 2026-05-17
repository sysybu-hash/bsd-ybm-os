import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { jsonBadRequest } from "@/lib/api-json";
import { logActivity } from "@/lib/activity-log";

type Payload = {
  action?: string;
  details?: string;
};

export const POST = withWorkspacesAuth(async (req, { userId, orgId }) => {
  const body = (await req.json().catch(() => null)) as Payload | null;
  const action = typeof body?.action === "string" ? body.action.trim() : "";
  const details = typeof body?.details === "string" ? body.details.trim() : "";

  if (!action) {
    return jsonBadRequest("חסר שדה action", "missing_action");
  }

  await logActivity(userId, orgId, `WIZARD:${action}`, details || undefined);
  return NextResponse.json({ ok: true });
});
