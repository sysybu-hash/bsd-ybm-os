import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { CloudProvider } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { jsonBadRequest, jsonServerError, jsonUnauthorized } from "@/lib/api-json";
import { prisma } from "@/lib/prisma";

/** רשימת חיבורים לגיבוי/סריקה — OAuth מלא יתווסף בהמשך (משתני סביבה לכל ספק). */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) {
    return jsonUnauthorized();
  }

  const items = await prisma.cloudIntegration.findMany({
    where: { organizationId: session.user.organizationId },
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
}

type Body = {
  provider?: CloudProvider;
  displayName?: string;
  autoScan?: boolean;
  backupExports?: boolean;
};

/** יצירת רשומת מקום לספק — ללא אסימונים אמיתיים עד להפעלת OAuth */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) {
    return jsonUnauthorized();
  }

  const body = (await req.json()) as Body;
  const provider = body.provider;
  if (!provider || !Object.values(CloudProvider).includes(provider)) {
    return jsonBadRequest("provider לא חוקי", "invalid_provider");
  }

  try {
    const row = await prisma.cloudIntegration.upsert({
      where: {
        organizationId_provider: {
          organizationId: session.user.organizationId,
          provider,
        },
      },
      create: {
        organizationId: session.user.organizationId,
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
    console.error(e);
    return jsonServerError("שמירה נכשלה");
  }
}
