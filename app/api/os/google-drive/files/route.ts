import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { GoogleDriveService } from "@/lib/services/google-drive";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const folderId = req.nextUrl.searchParams.get("folderId") || "root";
    const driveService = await GoogleDriveService.forUser(session.user.id);
    const files = await driveService.listFiles(folderId);

    return NextResponse.json({ files });
  } catch (error: any) {
    console.error("[Google Drive API Error]:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch files from Google Drive" },
      { status: 500 }
    );
  }
}
