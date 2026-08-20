import { NextResponse } from "next/server";
import { withWorkspacesAuthDynamic } from "@/lib/api-handler";
import { jsonNotFound } from "@/lib/api-json";
import { createLogger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { inferMimeFromFileName } from "@/lib/scan-mime";
import { GoogleDriveService } from "@/lib/services/google-drive";

export const dynamic = "force-dynamic";

const log = createLogger("erp-document-file");

export const GET = withWorkspacesAuthDynamic<{ id: string }>(
  async (_req, { orgId }, { params }) => {
    const { id } = await params;
    const doc = await prisma.document.findFirst({
      where: { id, organizationId: orgId },
      select: { id: true, fileName: true, fileDriveId: true, userId: true },
    });

    if (!doc) {
      return jsonNotFound("מסמך לא נמצא");
    }

    if (!doc.fileDriveId) {
      return NextResponse.json({ error: "אין קובץ מקור שמור למסמך זה" }, { status: 404 });
    }

    try {
      const drive = await GoogleDriveService.forUser(doc.userId);
      const guessedMime = inferMimeFromFileName(doc.fileName, "application/octet-stream");
      const { buffer, mimeType, name } = await drive.downloadFileContent(
        doc.fileDriveId,
        doc.fileName,
        guessedMime,
      );

      const disposition =
        new URL(_req.url).searchParams.get("disposition") === "attachment" ? "attachment" : "inline";

      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": mimeType,
          "Content-Disposition": `${disposition}; filename="${encodeURIComponent(name)}"`,
          "Cache-Control": "private, max-age=300",
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error("Failed to load archive document file", { documentId: id, message });
      return NextResponse.json({ error: "לא ניתן לטעון את קובץ המקור" }, { status: 502 });
    }
  },
);
