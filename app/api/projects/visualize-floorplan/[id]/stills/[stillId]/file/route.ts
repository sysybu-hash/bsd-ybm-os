import { NextResponse } from "next/server";
import { withWorkspacesAuthDynamic } from "@/lib/api-handler";
import { jsonNotFound } from "@/lib/api-json";
import { guardConstructionOnlyApi } from "@/lib/industry-api-guard";
import { getFloorplanVizStillBytesForOrg } from "@/lib/projects/floorplan-viz-store";

export const dynamic = "force-dynamic";

export const GET = withWorkspacesAuthDynamic<{ id: string; stillId: string }>(
  async (req, { orgId }, segment) => {
    const industryBlock = await guardConstructionOnlyApi(orgId);
    if (industryBlock) return industryBlock;
    const { id, stillId } = await segment.params;
    const still = await getFloorplanVizStillBytesForOrg(orgId, id, stillId);
    if (!still) return jsonNotFound("התמונה לא נמצאה", "viz_still_not_found");

    // A still's URL is stable across edits — PATCH rewrites the row in place — so
    // the bytes cannot be cached by URL alone. updatedAt moves on every edit, which
    // makes it a correct validator: browsing a gallery revalidates with 304s
    // instead of re-downloading ~0.6MB per image off Postgres every minute.
    const etag = `"${still.updatedAt.getTime().toString(36)}"`;
    const headers = {
      "Content-Type": still.mimeType || "image/jpeg",
      "Cache-Control": "private, max-age=60, must-revalidate",
      ETag: etag,
    };
    if (req.headers.get("if-none-match") === etag) {
      return new NextResponse(null, { status: 304, headers });
    }

    const buffer = Buffer.from(still.dataBase64, "base64");
    return new NextResponse(buffer, {
      status: 200,
      headers: { ...headers, "Content-Length": String(buffer.length) },
    });
  },
);
