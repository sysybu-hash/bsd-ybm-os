import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { jsonBadRequest } from "@/lib/api-json";
import { guardConstructionOnlyApi } from "@/lib/industry-api-guard";
import { FLOORPLAN_BLOB_MAX_BYTES } from "@/lib/projects/floorplan-blob";
import { createLogger } from "@/lib/logger";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

const log = createLogger("visualize-floorplan-upload");

/**
 * Hands the browser a one-off token so it can upload a plan straight to Blob.
 *
 * The bytes never pass through this function: Vercel caps a request body at
 * ~4.5MB, and a sales sheet is routinely larger. The token is scoped to the
 * file types this pipeline can read, and to a size the render can survive.
 */
export const POST = withWorkspacesAuth(async (req, { orgId, userId }) => {
  try {
    const industryBlock = await guardConstructionOnlyApi(orgId);
    if (industryBlock) return industryBlock;

    if (!env.BLOB_READ_WRITE_TOKEN) {
      return jsonBadRequest(
        "אחסון הקבצים אינו מוגדר — ניתן להעלות תוכנית עד 4MB בלבד",
        "blob_not_configured",
      );
    }

    const body = (await req.json()) as HandleUploadBody;
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [
          "application/pdf",
          "image/jpeg",
          "image/png",
          "image/webp",
          "image/heic",
          "image/heif",
        ],
        maximumSizeInBytes: FLOORPLAN_BLOB_MAX_BYTES,
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ orgId, userId }),
      }),
      // Runs on Vercel only — locally the callback cannot reach this machine.
      onUploadCompleted: async ({ blob }) => {
        log.info("plan uploaded to blob", { pathname: blob.pathname });
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    return apiErrorResponse(error, "floorplan viz upload token failed");
  }
});
