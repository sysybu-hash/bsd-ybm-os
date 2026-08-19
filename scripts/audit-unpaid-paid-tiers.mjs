/**
 * READ-ONLY audit: organizations sitting on a paid subscription tier with no
 * trace of a platform payment.
 *
 * Context: until the `?plan=` bypass was closed (PR #38), POST /api/register
 * granted the tier named in a client-supplied query parameter and activated the
 * account outright. Any org created that way holds a paid tier it never paid for.
 * There is no table recording platform-subscription payments, so the only
 * negative signal available is the absence of a Stripe subscription id.
 *
 * This script writes nothing. Review the output by hand — an org can legitimately
 * hold a paid tier with no Stripe id if a platform owner approved it through the
 * admin console (approvePendingRegistrationAction lets them pick the tier), or if
 * it was paid out of band.
 *
 * Run:
 *   node scripts/audit-unpaid-paid-tiers.mjs           # summary only
 *   node scripts/audit-unpaid-paid-tiers.mjs --detail  # include per-org rows
 */

import { config } from "dotenv";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

config({ path: resolve(process.cwd(), ".env.local") });

const showDetail = process.argv.includes("--detail");
const prisma = new PrismaClient();

async function main() {
  const paid = await prisma.organization.findMany({
    where: { subscriptionTier: { not: "FREE" } },
    select: {
      id: true,
      name: true,
      createdAt: true,
      subscriptionTier: true,
      subscriptionStatus: true,
      stripeSubscriptionId: true,
      stripeCustomerId: true,
      _count: { select: { users: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const noStripe = paid.filter((o) => !o.stripeSubscriptionId);

  console.log("=== Paid-tier organizations ===");
  console.log(`total on a paid tier:        ${paid.length}`);
  console.log(`  of which with Stripe sub:  ${paid.length - noStripe.length}`);
  console.log(`  of which WITHOUT Stripe:   ${noStripe.length}   <-- review these`);

  const byTier = {};
  for (const o of noStripe) {
    byTier[o.subscriptionTier] = (byTier[o.subscriptionTier] ?? 0) + 1;
  }
  console.log("\nno-Stripe breakdown by tier:");
  for (const [tier, n] of Object.entries(byTier).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${tier}`);
  }

  if (!showDetail) {
    console.log("\n(re-run with --detail to list the organizations)");
    return;
  }

  console.log("\n=== Detail ===");
  for (const o of noStripe) {
    console.log(
      [
        o.createdAt.toISOString().slice(0, 10),
        o.subscriptionTier.padEnd(10),
        o.subscriptionStatus.padEnd(16),
        `users=${o._count.users}`,
        o.name,
      ].join("  "),
    );
  }
}

main()
  .catch((err) => {
    console.error("audit failed:", err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
