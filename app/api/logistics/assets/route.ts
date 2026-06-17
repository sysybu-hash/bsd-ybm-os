import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { createLogger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { createAssetSchema } from "@/lib/validation/schemas/logistics";

export const dynamic = "force-dynamic";

const log = createLogger("logistics-assets");

const assetInclude = {
  currentUser: { select: { id: true, name: true, email: true } },
  project: { select: { id: true, name: true } },
} as const;

export const GET = withWorkspacesAuth(async (req, { orgId }) => {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";

  const assets = await prisma.asset.findMany({
    where: {
      organizationId: orgId,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { serialNumber: { contains: q, mode: "insensitive" } },
              { type: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
    include: assetInclude,
  });

  return NextResponse.json({ assets });
});

export const POST = withWorkspacesAuth(
  async (_req, { orgId }, data) => {
    try {
      const asset = await prisma.asset.create({
        data: {
          name: data.name,
          serialNumber: data.serialNumber ?? null,
          type: data.type ?? "tool",
          status: data.status ?? "AVAILABLE",
          organizationId: orgId,
        },
        include: assetInclude,
      });
      return NextResponse.json(asset, { status: 201 });
    } catch (err: unknown) {
      log.error("create asset failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      return apiErrorResponse(err, "logistics-asset-create");
    }
  },
  { schema: createAssetSchema },
);
