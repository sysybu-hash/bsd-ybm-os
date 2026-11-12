import { NextResponse } from "next/server";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSameOrigin, withVmbAuth } from "@/lib/vmb/api";
import { applyFileRescan, previewFileRescan } from "@/lib/vmb/scan-store";

export const dynamic = "force-dynamic";
/** The second round reads the whole sheet up to three times. */
export const maxDuration = 300;

const STATUS = { not_found: 404, kind_not_scanned: 422, fetch_failed: 502, unreadable: 422 } as const;
const bodySchema = z.object({ accept: z.array(z.string().max(255)).max(1000).optional() });

/**
 * The second scan of one file. Without `accept`: what it would find, stored nowhere. With `accept` (layer names from that
 * preview): read those layers and store the result as round 2.
 */
export const POST = withVmbAuth<{ id: string; fileId: string }>(async (req, { user, params }) => {
  if (!isSameOrigin(req)) return NextResponse.json({ code: "forbidden" }, { status: 403 });
  const limited = await applyRateLimit(req, "vmb:file-rescan", 30, 60_000);
  if (limited) return limited;
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ code: "bad_request" }, { status: 400 });
  if (parsed.data.accept) {
    const out = await applyFileRescan(user.id, params.id, params.fileId, parsed.data.accept);
    return out.ok ? NextResponse.json({ scan: out.scan }) : NextResponse.json({ code: out.code }, { status: STATUS[out.code] });
  }
  const out = await previewFileRescan(user.id, params.id, params.fileId);
  return out.ok ? NextResponse.json({ preview: out.preview }) : NextResponse.json({ code: out.code }, { status: STATUS[out.code] });
});
