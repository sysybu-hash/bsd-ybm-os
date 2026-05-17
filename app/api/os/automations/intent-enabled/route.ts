import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { jsonBadRequest } from "@/lib/api-json";
import { normalizeAutomationIntent } from "@/lib/os-automations/catalog";
import { isAutomationIntentEnabled } from "@/lib/platform-settings";

export const dynamic = "force-dynamic";

export const GET = withWorkspacesAuth(async (req) => {
  const intentRaw = new URL(req.url).searchParams.get("intent") ?? "";
  const intent = normalizeAutomationIntent(intentRaw);
  if (!intent) {
    return jsonBadRequest("intent לא תקין", "invalid_intent");
  }
  const enabled = await isAutomationIntentEnabled(intent);
  return NextResponse.json({ enabled, intent });
});
