/**
 * מחיקת משתמש לפי אימייל + ניקוי ארגון אם הוא היחיד בארגון (בדיקות / דמו).
 *
 * לא מוחק את מנהל המערכת (OS Owner: sysybu@gmail.com).
 *
 * דמה:
 *   npm run db:delete-user -- --email=jbuildgca@gmail.com --dry-run
 * ביצוע (מול Neon / DB לפי .env.local):
 *   npm run db:delete-user -- --email=jbuildgca@gmail.com --yes
 *
 * לפני הרצה: גיבוי DB אם פרודקשן.
 */

import { config } from "dotenv";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const prisma = new PrismaClient();

function steelAdminEmails() {
  return ["sysybu@gmail.com"];
}

function parseArgs() {
  const dryRun = process.argv.includes("--dry-run");
  const yes = process.argv.includes("--yes");
  const eq = process.argv.find((a) => a.startsWith("--email="));
  const email = eq ? eq.slice("--email=".length).trim().toLowerCase() : "";
  return { dryRun, yes, email };
}

async function wipeOrganizationBusinessData(tx, organizationId) {
  await tx.quote.deleteMany({ where: { organizationId } });
  await tx.contact.deleteMany({ where: { organizationId } });
  await tx.project.deleteMany({ where: { organizationId } });
  await tx.productPriceObservation.deleteMany({ where: { organizationId } });
  await tx.documentScanCache.deleteMany({ where: { organizationId } });
  await tx.document.deleteMany({ where: { organizationId } });
  await tx.activityLog.deleteMany({ where: { organizationId } });
  await tx.financialInsight.deleteMany({ where: { organizationId } });
  await tx.invoice.deleteMany({ where: { organizationId } });
  await tx.issuedDocument.deleteMany({ where: { organizationId } });
  await tx.cloudIntegration.deleteMany({ where: { organizationId } });
}

async function main() {
  const { dryRun, yes, email } = parseArgs();

  if (!email) {
    console.error("חובה: --email=user@example.com");
    console.error("דוגמה: npm run db:delete-user -- --email=test@x.com --dry-run");
    process.exit(1);
  }

  if (!yes && !dryRun) {
    console.error("הוסף --yes לביצוע או --dry-run לתצוגה בלבד.");
    process.exit(1);
  }

  if (steelAdminEmails().includes(email)) {
    console.error("אסור למחוק את מנהל הפלטפורמה:", email);
    process.exit(1);
  }

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, email: true, name: true, organizationId: true },
  });

  if (!user) {
    console.log("לא נמצא משתמש עם האימייל:", email);
    await prisma.$disconnect();
    return;
  }

  const orgId = user.organizationId;
  let soleInOrg = false;
  let orgName = null;

  if (orgId) {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true },
    });
    orgName = org?.name ?? orgId;
    const count = await prisma.user.count({ where: { organizationId: orgId } });
    soleInOrg = count === 1;
    if (!soleInOrg) {
      const others = await prisma.user.findMany({
        where: { organizationId: orgId, id: { not: user.id } },
        select: { email: true },
      });
      console.error(
        "לא בוצע: בארגון יש משתמשים נוספים — מחק ידנית או העבר אותם לפני מחיקת המשתמש.",
      );
      console.error("ארגון:", orgName, "| משתמשים אחרים:", others.map((o) => o.email).join(", "));
      await prisma.$disconnect();
      process.exit(1);
    }
  }

  const invites = await prisma.subscriptionInvitation.count({
    where: { email: { equals: email, mode: "insensitive" } },
  });

  console.log("משתמש:", user.email, user.name || "");
  if (orgId) console.log("ארגון (יימחק אחרי ניקוי):", orgName, "| משתמש יחיד בארגון:", soleInOrg);
  console.log("הזמנות מנוי (SubscriptionInvitation) לאימייל:", invites);

  if (dryRun) {
    console.log("\n[dry-run] לא בוצע שינוי.");
    await prisma.$disconnect();
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      await tx.subscriptionInvitation.deleteMany({
        where: { email: { equals: email, mode: "insensitive" } },
      });

      if (orgId && soleInOrg) {
        await wipeOrganizationBusinessData(tx, orgId);
      }

      await tx.activityLog.deleteMany({ where: { userId: user.id } });
      await tx.document.deleteMany({ where: { userId: user.id } });

      if (orgId && soleInOrg) {
        await tx.user.update({
          where: { id: user.id },
          data: { organizationId: null },
        });
        await tx.organization.delete({ where: { id: orgId } });
      }

      await tx.user.delete({ where: { id: user.id } });
    },
    { maxWait: 60_000, timeout: 120_000 },
  );

  console.log(
    "\nבוצע: המשתמש נמחק.",
    orgId && soleInOrg ? "הארגון ונתוני העסק שלו נמחקו." : "",
  );
  console.log("אפשר ליצור מחדש מטופס יצירת משתמש ידנית או הרשמה.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
