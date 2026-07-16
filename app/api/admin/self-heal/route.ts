import { NextResponse } from "next/server";
import { z } from "zod";
import { withOSAdmin } from "@/lib/api-handler";
import { jsonBadRequest } from "@/lib/api-json";
import {
  isSelfHealAction,
  logSelfHealAudit,
  runSelfHealAction,
  SELF_HEAL_ACTIONS,
} from "@/lib/admin/self-heal-actions";
import { createLogger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const log = createLogger("api/admin/self-heal");

const bodySchema = z.object({
  action: z.string().min(1),
  dryRun: z.boolean().optional().default(true),
  organizationId: z.string().optional(),
});

export const POST = withOSAdmin(async (req, { email: adminEmail, userId }) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return jsonBadRequest("בקשה לא תקינה", "invalid_body");
  }

  const { action, dryRun, organizationId } = parsed.data;
  if (!isSelfHealAction(action)) {
    return jsonBadRequest(
      `פעולה לא מורשית. מותר: ${SELF_HEAL_ACTIONS.join(", ")}`,
      "unknown_action",
    );
  }

  try {
    const result = await runSelfHealAction(action, dryRun, organizationId);
    await logSelfHealAudit(adminEmail, userId, result);

    return NextResponse.json({
      ok: true,
      status: dryRun ? "dry_run" : "applied",
      ...result,
    });
  } catch (err: unknown) {
    log.error("self-heal failed", {
      action,
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Self-heal failed", code: "self_heal_error" }, { status: 500 });
  }
});
