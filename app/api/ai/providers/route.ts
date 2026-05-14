import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { jsonUnauthorized } from "@/lib/api-json";
import { prisma } from "@/lib/prisma";
import { getAiProvidersPublic } from "@/lib/ai-providers";
import { getAllowedAiProvidersForPlan } from "@/lib/ai-engine-access";
import { isAdmin } from "@/lib/is-admin";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return jsonUnauthorized();
    }

    // 🛡️ BSD-YBM BSD-YBM: STABILITY FALLBACK
    // We attempt to fetch DB info, but if it fails (e.g. database maintenance),
    // we return a standard set of providers to keep the scanner operational.
    
    let plan = "FREE";
    let platformAiBypass = false;
    let allowedIds: string[] = ["openai", "anthropic", "gemini"]; // Default safe set

    try {
      const dbInfo = await Promise.all([
        prisma.user.findUnique({
          where: { id: session.user.id },
          select: { email: true },
        }),
        session.user.organizationId
          ? prisma.organization.findUnique({
              where: { id: session.user.organizationId },
              select: { subscriptionTier: true },
            })
          : Promise.resolve(null),
      ]);
      
      const userEmailRow = dbInfo[0];
      const orgPlan = dbInfo[1];

      plan = orgPlan?.subscriptionTier ?? "FREE";
      platformAiBypass = !!(userEmailRow?.email && isAdmin(userEmailRow.email));
      allowedIds = getAllowedAiProvidersForPlan(plan, platformAiBypass);
    } catch (dbErr) {
      console.error("[AI PROVIDERS] Database connection failed, using fallback mode:", dbErr);
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
      stabilityMode: true
    });
  } catch (criticalErr) {
    console.error("[AI PROVIDERS] Critical failure:", criticalErr);
    // Return minimum functional set even on critical error
    return NextResponse.json({
      providers: getAiProvidersPublic().map(p => ({ ...p, allowedByPlan: true })),
      plan: "GUEST",
      stabilityMode: true
    });
  }
}
