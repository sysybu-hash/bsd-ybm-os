import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { getErpPriceComparisonForOrg } from "@/lib/erp-price-comparison-data";

export const GET = withWorkspacesAuth(async (req, { orgId }) => {
  const comparison = await getErpPriceComparisonForOrg(orgId);
  return NextResponse.json({ comparison });
});
