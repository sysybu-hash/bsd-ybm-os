import { NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSameOrigin, withVmbAuth } from "@/lib/vmb/api";
import { scanProjectFile } from "@/lib/vmb/scan-store";

export const dynamic = "force-dynamic";
/** A large DXF takes a while to read whole. */
export const maxDuration = 300;

const STATUS = { not_found: 404, kind_not_scanned: 422, fetch_failed: 502, unreadable: 422 } as const;

/** Scans one uploaded file: what the readers take, and every thing they leave out. */
export const POST = withVmbAuth<{ id: string; fileId: string }>(async (req, { user, params }) => {
  if (!isSameOrigin(req)) return NextResponse.json({ code: "forbidden" }, { status: 403 });
  const limited = await applyRateLimit(req, "vmb:file-scan", 60, 60_000);
  if (limited) return limited;
  const out = await scanProjectFile(user.id, params.id, params.fileId);
  return out.ok ? NextResponse.json({ scan: out.scan }) : NextResponse.json({ code: out.code }, { status: STATUS[out.code] });
});
