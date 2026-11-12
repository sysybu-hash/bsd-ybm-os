import { NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/rate-limit";
import { vmbStudioCamerasBodySchema } from "@/lib/validation/schemas/vmb-studio";
import { isSameOrigin, withVmbAuth } from "@/lib/vmb/api";
import { setCameras } from "@/lib/vmb/studio-store";

export const dynamic = "force-dynamic";

const STATUS = { not_found: 404, running: 409 } as const;

/** Replaces the cameras the client added in the studio; the next run renders them. */
export const PUT = withVmbAuth<{ id: string }>(async (req, { user, params }) => {
  if (!isSameOrigin(req)) return NextResponse.json({ code: "forbidden" }, { status: 403 });
  const limited = await applyRateLimit(req, "vmb:cameras", 30, 60_000);
  if (limited) return limited;
  const parsed = vmbStudioCamerasBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: "bad_request" }, { status: 400 });
  const r = await setCameras(user.id, params.id, parsed.data.cameras);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ code: r.code }, { status: STATUS[r.code] });
});
