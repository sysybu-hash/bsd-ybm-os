import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";

/** תובנה פיננסית יומית שמורה לארגון (מילוי ע״י cron / מנוע תובנות) */
export const GET = withWorkspacesAuth(async (_req, { orgId }) => {
  const row = await prisma.financialInsight.findUnique({
    where: { organizationId: orgId },
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
});
