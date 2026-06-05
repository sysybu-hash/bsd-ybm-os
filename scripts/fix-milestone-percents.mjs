#!/usr/bin/env node
/**
 * Migrates legacy blueprint milestones (amounts summing to 100) into percent column.
 * Usage: npx dotenv-cli -e .env.local -- node scripts/fix-milestone-percents.mjs
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function looksLikePercents(amounts) {
  if (amounts.length === 0) return false;
  const sum = amounts.reduce((s, a) => s + a, 0);
  if (Math.abs(sum - 100) > 0.01) return false;
  return amounts.every((a) => a >= 0 && a <= 100);
}

async function main() {
  const projects = await prisma.project.findMany({
    select: { id: true, paymentMilestones: { select: { id: true, amount: true, percent: true } } },
  });
  let updated = 0;
  for (const p of projects) {
    const rows = p.paymentMilestones.filter((m) => m.percent == null);
    if (rows.length === 0) continue;
    const amounts = rows.map((m) => m.amount);
    if (!looksLikePercents(amounts)) continue;
    for (const m of rows) {
      await prisma.paymentMilestone.update({
        where: { id: m.id },
        data: { percent: m.amount, amount: 0 },
      });
      updated++;
    }
  }
  console.log(`Updated ${updated} milestone rows`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
