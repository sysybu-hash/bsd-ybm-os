import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { projectBlobWriteToken } from "@/lib/projects/pipeline/project-blob";
import { applyRateLimit } from "@/lib/rate-limit";
import { withVmbAuth } from "@/lib/vmb/api";
import { contentTypeFor, fileKind, projectBlobPrefix, VMB_FILE_MAX_BYTES } from "@/lib/vmb/files";
import { ownProject } from "@/lib/vmb/project-files";

export const dynamic = "force-dynamic";

/**
 * Hands the browser a one-off Blob token for one file of one project. The
 * bytes go straight to storage (a request body here is capped at ~4.5 MB).
 * The token is bound to a path under this project and to the file's type.
 */
export const POST = withVmbAuth<{ id: string }>(async (req, { user, params }) => {
  const limited = await applyRateLimit(req, "vmb:upload-token", 600, 60_000);
  if (limited) return limited;
  const token = projectBlobWriteToken();
  if (!token) return NextResponse.json({ code: "storage_off" }, { status: 503 });
  const project = await ownProject(user.id, params.id);
  if (!project) return NextResponse.json({ code: "not_found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as HandleUploadBody | null;
  if (!body) return NextResponse.json({ code: "invalid" }, { status: 400 });
  try {
    const result = await handleUpload({
      body,
      request: req,
      token,
      onBeforeGenerateToken: async (pathname) => {
        const type = contentTypeFor(pathname);
        if (!pathname.startsWith(projectBlobPrefix(project.id)) || !fileKind(pathname) || !type) {
          throw new Error("path or type not allowed");
        }
        return { allowedContentTypes: [type], maximumSizeInBytes: VMB_FILE_MAX_BYTES, addRandomSuffix: true };
      },
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ code: "refused" }, { status: 400 });
  }
});
