import { NextResponse } from "next/server";
import { withWorkspacesAuthDynamic } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import { guardConstructionOnlyApi } from "@/lib/industry-api-guard";
import { applyRateLimit } from "@/lib/rate-limit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export const GET = withWorkspacesAuthDynamic<{ id: string }>(
  async (req, { orgId }, segment) => {
    const limited = await applyRateLimit(req as NextRequest, "field-copilot:assets:get", 120, 60_000);
    if (limited) return limited;

    const blocked = await guardConstructionOnlyApi(orgId);
    if (blocked) return blocked;

    const { id } = await segment.params;

    const asset = await prisma.fieldCopilotAsset.findFirst({
      where: { id, organizationId: orgId },
      select: { dataBase64: true, mimeType: true },
    });

    if (!asset) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });

    const buffer = Buffer.from(asset.dataBase64, "base64");
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": asset.mimeType,
        "Cache-Control": "private, max-age=3600, immutable",
        "Content-Length": String(buffer.length),
      },
    });
  },
);
