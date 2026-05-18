/**
 * מוודא שמנוי מקאנו (jbuildgca@gmail.com) קיים ופעיל בארגון.
 *
 * שימוש: npx dotenv -e .env.local -- node scripts/ensure-meckano-subscriber.mjs [email]
 */
import { PrismaClient } from "@prisma/client";

const DEFAULT_EMAIL = "jbuildgca@gmail.com";
const email = (process.argv[2] || DEFAULT_EMAIL).trim().toLowerCase();
const prisma = new PrismaClient();

async function main() {
  let user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });

  let orgId = user?.organizationId ?? null;
  if (!orgId) {
    const org = await prisma.organization.create({
      data: {
        name: `ארגון — ${email}`,
        type: "SMB",
        subscriptionTier: "PROFESSIONAL",
        subscriptionStatus: "ACTIVE",
        cheapScansRemaining: 500,
        premiumScansRemaining: 100,
        maxCompanies: 25,
      },
    });
    orgId = org.id;
    console.log(`נוצר ארגון: ${orgId}`);
  } else {
    await prisma.organization.update({
      where: { id: orgId },
      data: { subscriptionStatus: "ACTIVE" },
    });
  }

  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name: "מנוי מקאנו",
        role: "ORG_ADMIN",
        organizationId: orgId,
        accountStatus: "ACTIVE",
      },
    });
    console.log(`נוצר משתמש: ${user.id}`);
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        email,
        organizationId: orgId,
        accountStatus: "ACTIVE",
        role: user.role === "SUPER_ADMIN" ? "SUPER_ADMIN" : "ORG_ADMIN",
      },
    });
    console.log(`עודכן משתמש: ${user.id}`);
  }

  console.log(`✓ ${email} פעיל — ארגון ${orgId}, תפקיד ${user.role}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
