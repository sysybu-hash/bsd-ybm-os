import { NextResponse } from "next/server";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSameOrigin, withVmbAuth } from "@/lib/vmb/api";
import { isRetentionChoice, setRetention } from "@/lib/vmb/retention";
import { ensureWorkspace } from "@/lib/vmb/workspace";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ days: z.union([z.number().int(), z.null()]).refine(isRetentionChoice) });

/** The office's file-deletion policy (rule 13.11); only its owner may change it. */
export const PUT = withVmbAuth(async (req, { user }) => {
  if (!isSameOrigin(req)) return NextResponse.json({ code: "forbidden" }, { status: 403 });
  const limited = await applyRateLimit(req, "vmb:retention", 20, 60_000);
  if (limited) return limited;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: "bad_request" }, { status: 400 });
  const ws = await ensureWorkspace(user);
  const ok = await setRetention(user.id, ws.id, parsed.data.days as Parameters<typeof setRetention>[2]);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ code: "not_owner" }, { status: 403 });
});
