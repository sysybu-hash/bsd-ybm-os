import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { jsonUnauthorized } from "@/lib/api-json";
import { prisma } from "@/lib/prisma";

/** תובנה פיננסית יומית שמורה לארגון (מילוי ע״י cron / מנוע תובנות) */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) {
    return jsonUnauthorized();
  }

  const row = await prisma.financialInsight.findUnique({
    where: { organizationId: session.user.organizationId },
    select: { content: true, updatedAt: true },
  });

  if (!row) {
    return NextResponse.json({
      content:
        "עדיין אין תובנה יומית שמורה לארגון. לאחר הרצת ניתוח מסמכים/קרון (`/api/cron/financial-insights`) יופיע כאן סיכום אוטומטי.",
      updatedAt: null as string | null,
    });
  }

  return NextResponse.json({
    content: row.content,
    updatedAt: row.updatedAt.toISOString(),
  });
}
