import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import { getAiProvidersPublic } from "@/lib/ai-providers";
import { getAllowedAiProvidersForPlan } from "@/lib/ai-engine-access";
import { isAdmin } from "@/lib/is-admin";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { createLogger } from "@/lib/logger";

const log = createLogger("ai-providers");

export const GET = withWorkspacesAuth(async (_req, { orgId, userId }) => {
  try {
    let plan = "FREE";
    let platformAiBypass = false;
    let allowedIds: string[] = ["openai", "anthropic", "gemini"];

    try {
      const [userEmailRow, orgPlan] = await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: { email: true },
        }),
        prisma.organization.findUnique({
          where: { id: orgId },
          select: { subscriptionTier: true },
        }),
      ]);

      plan = orgPlan?.subscriptionTier ?? "FREE";
      platformAiBypass = !!(userEmailRow?.email && isAdmin(userEmailRow.email));
      allowedIds = getAllowedAiProvidersForPlan(plan, platformAiBypass);
    } catch (dbErr) {
      log.error("database connection failed — using fallback mode", { error: dbErr instanceof Error ? dbErr.message : String(dbErr) });
    }

    const providers = getAiProvidersPublic().map((p) => ({
      ...p,
      allowedByPlan: allowedIds.includes(p.id) || plan !== "FREE",
    }));

    return NextResponse.json({
      providers,
      plan,
      subscriptionTier: plan,
      allowedProviderIds: allowedIds,
      stabilityMode: true,
    });
  } catch (err: unknown) {
    log.error("critical failure", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({
      providers: getAiProvidersPublic().map((p) => ({ ...p, allowedByPlan: true })),
      plan: "GUEST",
      stabilityMode: true,
    });
  }
});
