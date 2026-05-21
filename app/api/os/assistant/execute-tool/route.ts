import { z } from "zod";
import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { jsonBadRequest } from "@/lib/api-json";
import { normalizeAutomationIntent } from "@/lib/os-automations/catalog";
import { parseOsActionMessage } from "@/lib/os-automations/parse-action-server";
import type { AutomationAction } from "@/lib/os-automations/types";
import { isAutomationIntentEnabled } from "@/lib/platform-settings";
import { apiErrorResponse } from "@/lib/api-route-helpers";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  name: z.string().min(1),
  args: z.record(z.string(), z.unknown()).default({}),
});

export const POST = withWorkspacesAuth(
  async (_req, ctx, body) => {
    try {
      const { name, args } = body;
      const clientActions: AutomationAction[] = [];

      if (name === "run_automation") {
        const intent = normalizeAutomationIntent(typeof args.intent === "string" ? args.intent : "");
        if (!intent) {
          return NextResponse.json({ result: `לא נמצא intent: ${String(args.intent)}` });
        }
        const enabled = await isAutomationIntentEnabled(intent);
        if (!enabled) {
          return NextResponse.json({ result: "הפעולה מושבתת בהגדרות הפלטפורמה." });
        }
        const params =
          args.params && typeof args.params === "object"
            ? (args.params as Record<string, unknown>)
            : undefined;
        clientActions.push({ intent, params });
        return NextResponse.json({ result: "מבצע פעולה", clientActions });
      }

      if (name === "execute_user_command") {
        const message = typeof args.message === "string" ? args.message.trim() : "";
        if (!message) {
          return NextResponse.json({ result: "חסרה פקודה" });
        }
        const parsed = await parseOsActionMessage(ctx.userId, ctx.orgId, ctx.role, message);
        if (parsed.error) {
          return NextResponse.json({ result: parsed.error });
        }
        if (parsed.actions?.length) {
          return NextResponse.json({
            result: parsed.reply?.trim() || `מבצע ${parsed.actions.length} פעולות`,
            clientActions: parsed.actions,
          });
        }
        if (parsed.reply?.trim()) {
          return NextResponse.json({ result: parsed.reply.trim() });
        }
        return NextResponse.json({ result: "לא זוהתה פעולה לביצוע" });
      }

      return NextResponse.json({ result: `כלי לא נתמך בשרת: ${name}` });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return jsonBadRequest("נתונים לא תקינים", "invalid_body");
      }
      return apiErrorResponse(err, "os/assistant/execute-tool");
    }
  },
  { schema: bodySchema },
);
