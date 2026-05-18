/**
 * מקדם משתמש קיים ל-SUPER_ADMIN לפי אימייל (ברירת מחדל: yb@bsd-ybm.co.il).
 * המשתמש חייב כבר להירשם במערכת (רשומה ב-users).
 *
 * שימוש: node scripts/ensure-platform-super-admin.mjs [email]
 */
import { PrismaClient } from "@prisma/client";

const email = (process.argv[2] || "yb@bsd-ybm.co.il").trim().toLowerCase();
const OS_UNLIMITED = 2_147_483_647;
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });
  if (!user) {
    console.error(
      `לא נמצא משתמש עם ${email}. התחברו פעם אחת עם Google לאותו אימייל, ואז הריצו שוב.`,
    );
    process.exit(1);
  }

  let orgId = user.organizationId;
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
      },
    });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      role: "SUPER_ADMIN",
      organizationId: orgId,
      email,
      accountStatus: "ACTIVE",
    },
  });

  console.log(`✓ ${email} עודכן ל-SUPER_ADMIN (org: ${orgId})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
