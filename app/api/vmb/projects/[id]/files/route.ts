import { NextResponse } from "next/server";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSameOrigin, withVmbAuth } from "@/lib/vmb/api";
import { registerUploadedFile } from "@/lib/vmb/project-files";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ url: z.string().url().max(2000), relPath: z.string().min(1).max(400) });

const STATUS: Record<string, number> = { not_found: 404, not_in_store: 400, bad_path: 400, bad_kind: 400, too_many_files: 409, project_too_large: 409, file_too_large: 413 };

/** Records a file the browser uploaded to Blob with a token from ../upload. */
export const POST = withVmbAuth<{ id: string }>(async (req, { user, params }) => {
  if (!isSameOrigin(req)) return NextResponse.json({ code: "forbidden" }, { status: 403 });
  const limited = await applyRateLimit(req, "vmb:file-register", 600, 60_000);
  if (limited) return limited;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: "invalid" }, { status: 400 });
  const r = await registerUploadedFile({ userId: user.id, projectId: params.id, ...parsed.data });
  if (!r.ok) return NextResponse.json({ code: r.code }, { status: STATUS[r.code] ?? 400 });
  return NextResponse.json({ file: r.file }, { status: 201 });
});
