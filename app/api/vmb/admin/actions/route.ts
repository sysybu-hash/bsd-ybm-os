import { NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/rate-limit";
import { vmbAdminActionSchema } from "@/lib/validation/schemas/vmb-admin";
import { isVmbSuperAdmin } from "@/lib/vmb/admin";
import { runAdminAction } from "@/lib/vmb/admin-store";
import { isSameOrigin, withVmbAuth } from "@/lib/vmb/api";

export const dynamic = "force-dynamic";

const STATUS = { not_found: 404, no_subscription: 409, below_zero: 409, duplicate: 409, not_frozen: 409, not_active: 409 } as const;

/** An administrator's hand action on an office: credits, manual activation, freeze, extend. Not an admin → 404. */
export const POST = withVmbAuth(async (req, { user }) => {
  if (!isSameOrigin(req)) return NextResponse.json({ code: "forbidden" }, { status: 403 });
  const limited = await applyRateLimit(req, "vmb:admin-action", 30, 60_000);
  if (limited) return limited;
  if (!(await isVmbSuperAdmin(user))) return NextResponse.json({ code: "not_found" }, { status: 404 });
  const parsed = vmbAdminActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: "bad_request" }, { status: 400 });
  const r = await runAdminAction(user.email, parsed.data);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ code: r.code }, { status: STATUS[r.code] });
});
