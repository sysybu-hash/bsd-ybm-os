import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { isVizPaintEmail, VIZ_PAINT_EMAIL } from "@/lib/projects/viz-paint-access";

export type VizAccess = {
  /** An active subscription on one of the plans. The measured visualisation is included. */
  subscriber: boolean;
  /** sysybu@gmail.com, plus any address listed in VIZ_PAINT_EMAILS. */
  paint: boolean;
  /** Where every other subscriber is sent to ask for painting. */
  contactEmail: string;
};

export async function vizAccessForUser(userId: string, orgId: string): Promise<VizAccess> {
  const [user, org] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
    prisma.organization.findUnique({ where: { id: orgId }, select: { subscriptionStatus: true, subscriptionTier: true } }),
  ]);
  const subscriber = org?.subscriptionStatus === "ACTIVE" && Boolean(org.subscriptionTier);
  return {
    subscriber,
    paint: subscriber && isVizPaintEmail(user?.email, env.VIZ_PAINT_EMAILS),
    contactEmail: VIZ_PAINT_EMAIL,
  };
}
