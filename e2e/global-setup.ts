import { execSync } from "node:child_process";
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";

loadEnv({ path: ".env.local" });
loadEnv();

const E2E_EMAIL = process.env.E2E_EMAIL ?? "owner@bsd-demo.test";

export default async function globalSetup() {
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findFirst({
      where: { email: { equals: E2E_EMAIL, mode: "insensitive" } },
      select: { id: true, passwordHash: true, accountStatus: true },
    });
    const needsSeed =
      !user?.passwordHash ||
      user.accountStatus !== "ACTIVE" ||
      process.env.E2E_FORCE_SEED === "1";

    if (needsSeed) {
      console.log(`[e2e] Seeding test data (E2E user ${E2E_EMAIL} missing or inactive)...`);
      execSync("node scripts/seed-test-data.mjs", {
        stdio: "inherit",
        cwd: process.cwd(),
        env: process.env,
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}
