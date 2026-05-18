/**
 * יוצר/מקדם סופר-אדמין לפי אימייל (ברירת מחדל: yb@bsd-ybm.co.il).
 *
 * שימוש: node scripts/ensure-platform-super-admin.mjs [email]
 */
import { PrismaClient } from "@prisma/client";

const ADMIN_EMAILS = new Set([
  "yb@bsd-ybm.co.il",
  "sysybu@gmail.com",
]);

const email = (process.argv[2] || "yb@bsd-ybm.co.il").trim().toLowerCase();
const OS_UNLIMITED = 2_147_483_647;
const prisma = new PrismaClient();

async function main() {
  if (!ADMIN_EMAILS.has(email)) {
    console.error(`האימייל ${email} אינו ברשימת סופר-אדמין המובנית.`);
    process.exit(1);
  }

  let user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });

  let orgId = user?.organizationId ?? null;
  if (!orgId) {
    const org = await prisma.organization.create({
      data: {
        name: "BSD-YBM-OS — מפתחי מערכת",
        type: "ENTERPRISE",
        subscriptionTier: "CORPORATE",
        subscriptionStatus: "ACTIVE",
        cheapScansRemaining: OS_UNLIMITED,
        premiumScansRemaining: OS_UNLIMITED,
        maxCompanies: 999,
      },
    });
    orgId = org.id;
  } else {
    await prisma.organization.update({
      where: { id: orgId },
      data: {
        cheapScansRemaining: OS_UNLIMITED,
        premiumScansRemaining: OS_UNLIMITED,
        maxCompanies: 999,
        subscriptionTier: "CORPORATE",
        subscriptionStatus: "ACTIVE",
        name: "BSD-YBM-OS — מפתחי מערכת",
      },
    });
  }

  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name: "מנהל BSD-YBM",
        role: "SUPER_ADMIN",
        organizationId: orgId,
        accountStatus: "ACTIVE",
      },
    });
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        role: "SUPER_ADMIN",
        organizationId: orgId,
        email,
        accountStatus: "ACTIVE",
      },
    });
  }

  console.log(`✓ ${email} מוכן כ-SUPER_ADMIN (org: ${orgId}, user: ${user.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
