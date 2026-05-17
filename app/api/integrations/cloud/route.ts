import { NextResponse } from "next/server";
import { CloudProvider } from "@prisma/client";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { jsonBadRequest } from "@/lib/api-json";
import { prisma } from "@/lib/prisma";

/** רשימת חיבורים לגיבוי/סריקה — OAuth מלא יתווסף בהמשך (משתני סביבה לכל ספק). */
export const GET = withWorkspacesAuth(async (_req, { orgId }) => {
  const items = await prisma.cloudIntegration.findMany({
    where: { organizationId: orgId },
    select: {
      id: true,
      provider: true,
      displayName: true,
      autoScan: true,
      backupExports: true,
      lastSyncAt: true,
    },
    orderBy: { provider: "asc" },
  });

  return NextResponse.json({ items });
});

type Body = {
  provider?: CloudProvider;
  displayName?: string;
  autoScan?: boolean;
  backupExports?: boolean;
};

/** יצירת רשומת מקום לספק — ללא אסימונים אמיתיים עד להפעלת OAuth */
export const POST = withWorkspacesAuth(async (req, { orgId }) => {
  try {
    const body = (await req.json()) as Body;
    const provider = body.provider;
    if (!provider || !Object.values(CloudProvider).includes(provider)) {
      return jsonBadRequest("provider לא חוקי", "invalid_provider");
    }

    const row = await prisma.cloudIntegration.upsert({
      where: {
        organizationId_provider: {
          organizationId: orgId,
          provider,
        },
      },
      create: {
        organizationId: orgId,
        provider,
        displayName: body.displayName?.trim() || null,
        autoScan: Boolean(body.autoScan),
        backupExports: Boolean(body.backupExports),
      },
      update: {
        displayName: body.displayName?.trim() || null,
        autoScan: Boolean(body.autoScan),
        backupExports: Boolean(body.backupExports),
      },
    });
    return NextResponse.json({ ok: true, item: row });
  } catch (e) {
    return apiErrorResponse(e, "Cloud integration POST Error");
  }
});
