import { NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/rate-limit";
import { vmbCostActionSchema } from "@/lib/validation/schemas/vmb-admin";
import { isVmbSuperAdmin } from "@/lib/vmb/admin";
import { isSameOrigin, withVmbAuth } from "@/lib/vmb/api";
import { runCostAction } from "@/lib/vmb/costs-store";

export const dynamic = "force-dynamic";

/** A change to the cost console: a rate, or a fixed monthly cost. Not an admin → 404. */
export const POST = withVmbAuth(async (req, { user }) => {
  if (!isSameOrigin(req)) return NextResponse.json({ code: "forbidden" }, { status: 403 });
  const limited = await applyRateLimit(req, "vmb:admin-costs", 30, 60_000);
  if (limited) return limited;
  if (!(await isVmbSuperAdmin(user))) return NextResponse.json({ code: "not_found" }, { status: 404 });
  const parsed = vmbCostActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: "bad_request" }, { status: 400 });
  const r = await runCostAction(user.email, parsed.data);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ code: r.code }, { status: r.code === "not_found" ? 404 : 400 });
});
