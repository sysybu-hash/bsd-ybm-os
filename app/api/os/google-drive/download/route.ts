import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { GoogleDriveService } from "@/lib/services/google-drive";
import { googleDriveErrorResponse } from "@/lib/google-drive-api-errors";
import { inferMimeFromFileName, isSupportedScanMime, MAX_SCAN_FILE_BYTES } from "@/lib/scan-mime";

export const dynamic = "force-dynamic";

export const GET = withWorkspacesAuth(async (req, { userId }) => {
  try {
    const fileId = new URL(req.url).searchParams.get("fileId");
    const fileName = new URL(req.url).searchParams.get("fileName") ?? "drive-file";
    const mimeType = new URL(req.url).searchParams.get("mimeType") ?? "application/octet-stream";

    if (!fileId) {
      return NextResponse.json({ error: "חסר fileId" }, { status: 400 });
    }

    if (mimeType === "application/vnd.google-apps.folder") {
      return NextResponse.json({ error: "לא ניתן להוריד תיקייה — בחרו קובץ" }, { status: 400 });
    }

    const drive = await GoogleDriveService.forUser(userId);
    const { buffer, mimeType: resolvedMime, name } = await drive.downloadFileContent(
      fileId,
      fileName,
      mimeType,
    );

    if (buffer.length > MAX_SCAN_FILE_BYTES) {
      return NextResponse.json({ error: "קובץ גדול מדי לפענוח (מקסימום 25MB)" }, { status: 400 });
    }

    const scanMime = inferMimeFromFileName(name, resolvedMime);
    if (!isSupportedScanMime(scanMime)) {
      return NextResponse.json(
        { error: `סוג קובץ לא נתמך לפענוח: ${scanMime}` },
        { status: 400 },
      );
    }

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": scanMime,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(name)}"`,
        "X-Drive-File-Name": encodeURIComponent(name),
      },
    });
  } catch (error) {
    return googleDriveErrorResponse(error);
  }
});
