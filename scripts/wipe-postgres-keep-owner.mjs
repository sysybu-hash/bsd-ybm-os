/**
 * מחיקת כל המשתמשים חוץ מבעלים אחד + ניקוי מלא של נתוני עסק (דמו / ישן).
 *
 * לא מוחק את רשומת ה-Organization של הבעלים (אם קיימת) — רק את התוכן שלה.
 *
 * הרצה (אחרי גיבוי DB!):
 *   npm run db:wipe:keep-owner -- --yes
 *
 * מייל בעלים: RESET_KEEP_OWNER_EMAIL או LOGIN_ALLOWLIST_EMAILS (הראשון ברשימה) או ברירת מחדל sysybu@gmail.com
 *
 * דמה בלבד (ללא שינוי):
 *   npm run db:wipe:keep-owner -- --dry-run
 */

import { config } from "dotenv";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const prisma = new PrismaClient();

function parseArgs() {
  const dryRun = process.argv.includes("--dry-run");
  const yes = process.argv.includes("--yes");
  let email =
    process.env.RESET_KEEP_OWNER_EMAIL?.trim() ||
    process.env.LOGIN_ALLOWLIST_EMAILS?.split(",")[0]?.trim() ||
    process.env.ALLOWED_LOGIN_EMAILS?.split(",")[0]?.trim() ||
    "sysybu@gmail.com";
  const eq = process.argv.find((a) => a.startsWith("--email="));
  if (eq) email = eq.slice("--email=".length).trim().toLowerCase();
  return { dryRun, yes, email: email.toLowerCase() };
}

/** מוחק כל הנתונים התלויים בארגון בלי למחוק את שורת Organization */
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

  if (!yes && !dryRun) {
    console.error(
      "חובה להעביר --yes כדי לבצע מחיקה, או --dry-run לתצוגה בלבד.\n" +
        "דוגמה: npm run db:wipe:keep-owner -- --yes",
    );
    process.exit(1);
  }

  const keeper = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, email: true, organizationId: true, name: true },
  });

  if (!keeper) {
    console.error(`לא נמצא משתמש עם אימייל: ${email}`);
    process.exit(1);
  }

  const orgs = await prisma.organization.findMany({ select: { id: true, name: true } });
  const allUsers = await prisma.user.findMany({
    select: { id: true, email: true, organizationId: true },
  });
  const others = allUsers.filter((u) => u.id !== keeper.id);

  console.log(`בעלים נשמר: ${keeper.email} (${keeper.id})`);
  console.log(`ארגונים במסד: ${orgs.length}`);
  console.log(`משתמשים למחיקה: ${others.length}`);
  if (others.length) console.log(others.map((u) => u.email).join(", "));

  if (dryRun) {
    console.log("\n[dry-run] לא בוצע שינוי.");
    await prisma.$disconnect();
    return;
  }

  const keepOrgId = keeper.organizationId;

  await prisma.$transaction(
    async (tx) => {
      for (const org of orgs) {
        await wipeOrganizationBusinessData(tx, org.id);
      }

      if (others.length > 0) {
        const otherIds = others.map((u) => u.id);
        await tx.document.deleteMany({ where: { userId: { in: otherIds } } });
        await tx.activityLog.deleteMany({ where: { userId: { in: otherIds } } });
        await tx.user.deleteMany({ where: { id: { in: otherIds } } });
      }

      const orgIdsToDelete = keepOrgId ? orgs.filter((o) => o.id !== keepOrgId).map((o) => o.id) : orgs.map((o) => o.id);

      if (orgIdsToDelete.length > 0) {
        await tx.organization.deleteMany({ where: { id: { in: orgIdsToDelete } } });
      }

      if (!keepOrgId) {
        const created = await tx.organization.create({
          data: {
            name: "BSD-YBM",
            type: "ENTERPRISE",
            subscriptionTier: "CORPORATE",
            subscriptionStatus: "ACTIVE",
            cheapScansRemaining: 2_147_483_647,
            premiumScansRemaining: 2_147_483_647,
            maxCompanies: 999,
            companyType: "LICENSED_DEALER",
            isReportable: true,
          },
          select: { id: true },
        });
        await tx.user.update({
          where: { id: keeper.id },
          data: {
            organizationId: created.id,
            role: "SUPER_ADMIN",
            accountStatus: "ACTIVE",
          },
        });
      } else {
        await tx.user.update({
          where: { id: keeper.id },
          data: { role: "SUPER_ADMIN", accountStatus: "ACTIVE" },
        });
      }

      await tx.verificationToken.deleteMany({});
    },
    { maxWait: 60_000, timeout: 300_000 },
  );

  console.log("\nבוצע: נתוני עסק נוקו, משתמשים אחרים נמחקו, ארגונים מיותרים הוסרו.");
  console.log("התחבר מחדש ב-Google כדי לרענן OAuth.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
