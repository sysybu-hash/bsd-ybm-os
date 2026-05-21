import { NextResponse } from "next/server";
import { isCompanyMgmtIndustry } from "@/lib/business-lines";
import { prisma } from "@/lib/prisma";

/** חוסם API ספציפי לבנייה (BOQ, יומן שטח וכו') לענף ניהול עסק */
export async function guardConstructionOnlyApi(
  orgId: string,
): Promise<NextResponse | null> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { industry: true },
  });
  if (isCompanyMgmtIndustry(org?.industry)) {
    return NextResponse.json(
      { error: "מודול זה זמין רק לענף בנייה וקבלנות" },
      { status: 403 },
    );
  }
  return null;
}
