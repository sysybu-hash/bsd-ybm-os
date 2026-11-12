import { NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/rate-limit";
import { vmbUnitBodySchema } from "@/lib/validation/schemas/vmb-projects";
import { isSameOrigin, withVmbAuth } from "@/lib/vmb/api";
import { setUnit } from "@/lib/vmb/answers-store";

export const dynamic = "force-dynamic";

const STATUS = { not_found: 404, running: 409, not_offered: 400 } as const;

/** Picks the flat to build when the drawing is a whole floor. */
export const PUT = withVmbAuth<{ id: string }>(async (req, { user, params }) => {
  if (!isSameOrigin(req)) return NextResponse.json({ code: "forbidden" }, { status: 403 });
  const limited = await applyRateLimit(req, "vmb:unit", 30, 60_000);
  if (limited) return limited;
  const parsed = vmbUnitBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: "bad_request" }, { status: 400 });
  const r = await setUnit(user.id, params.id, parsed.data.unit);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ code: r.code }, { status: STATUS[r.code] });
});
