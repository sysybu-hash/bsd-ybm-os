import { NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSameOrigin, withVmbAuth } from "@/lib/vmb/api";
import { deleteProjectFile } from "@/lib/vmb/project-files";

export const dynamic = "force-dynamic";

/** Removes one file from a project and from storage. */
export const DELETE = withVmbAuth<{ id: string; fileId: string }>(async (req, { user, params }) => {
  if (!isSameOrigin(req)) return NextResponse.json({ code: "forbidden" }, { status: 403 });
  const limited = await applyRateLimit(req, "vmb:file-delete", 120, 60_000);
  if (limited) return limited;
  const ok = await deleteProjectFile(user.id, params.id, params.fileId);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ code: "not_found" }, { status: 404 });
});
