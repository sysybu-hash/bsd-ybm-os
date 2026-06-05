import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { jsonForbidden } from "@/lib/api-json";
import { extractMeckanoDataArray } from "@/lib/meckano/mappers";
import { meckanoFetch } from "@/lib/meckano-fetch";
import { getAuthorizedMeckanoOrganizationId, MECKANO_ACCESS_ERROR } from "@/lib/meckano-access";
import { meckanoSessionFromWorkspace, requireMeckanoSession } from "@/lib/meckano-route-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function zoneNameFromRow(row: Record<string, unknown>): string | null {
  const name = [row.name, row.description, row.title, row.zoneName]
    .find((v) => typeof v === "string" && v.trim());
  return typeof name === "string" ? name.trim() : null;
}

export const POST = withWorkspacesAuth(async (_req, ctx): Promise<NextResponse> => {
  try {
    const sessionLike = await meckanoSessionFromWorkspace(ctx);
    const auth = await requireMeckanoSession(sessionLike);
    if ("error" in auth) return auth.error;

    const organizationId = await getAuthorizedMeckanoOrganizationId(sessionLike);
    if (!organizationId) return jsonForbidden(MECKANO_ACCESS_ERROR);

    const paths = ["zones", "locations", "sites"];
    let imported = 0;

    for (const path of paths) {
      const res = await meckanoFetch(path, auth.apiKey, { method: "GET" });
      if (!res.ok) continue;
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const rows = extractMeckanoDataArray(json);
      for (const row of rows) {
        const name = zoneNameFromRow(row);
        if (!name) continue;
        const address =
          typeof row.address === "string" && row.address.trim()
            ? row.address.trim()
            : name;
        const existing = await prisma.meckanoZone.findFirst({
          where: { organizationId, name },
        });
        if (existing) continue;
        await prisma.meckanoZone.create({
          data: {
            organizationId,
            name,
            address,
            description:
              typeof row.description === "string" ? row.description : null,
            lat: typeof row.lat === "number" ? row.lat : null,
            lng: typeof row.lng === "number" ? row.lng : null,
            radius: typeof row.radius === "number" ? row.radius : 150,
          },
        });
        imported++;
      }
      if (rows.length > 0) break;
    }

    return NextResponse.json({ success: true, imported });
  } catch (error: unknown) {
    return apiErrorResponse(error, "Meckano zones sync");
  }
});
