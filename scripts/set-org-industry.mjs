/**
 * מעדכן industry + התמחות (constructionTrade) לארגון לפי אימייל אדמין או מזהה ארגון.
 *
 * שימוש:
 *   node scripts/set-org-industry.mjs COMPANY_MGMT GENERAL_BUSINESS sysybu@gmail.com
 *   node scripts/set-org-industry.mjs CONSTRUCTION GENERAL_CONTRACTOR --org-id <uuid>
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const VALID_INDUSTRIES = new Set(["CONSTRUCTION", "COMPANY_MGMT", "GENERAL"]);

async function main() {
  const industry = (process.argv[2] || "COMPANY_MGMT").trim().toUpperCase();
  const specialization = (process.argv[3] || "GENERAL_BUSINESS").trim();
  const emailOrFlag = process.argv[4]?.trim();
  const orgIdFlag = process.argv.includes("--org-id")
    ? process.argv[process.argv.indexOf("--org-id") + 1]?.trim()
    : null;

  if (!VALID_INDUSTRIES.has(industry) && industry !== "BUSINESS") {
    console.error(`ענף לא תקין: ${industry}`);
    process.exit(1);
  }
  const normalizedIndustry = industry === "BUSINESS" ? "COMPANY_MGMT" : industry;

  let orgId = orgIdFlag || null;
  if (!orgId && emailOrFlag && !emailOrFlag.startsWith("--")) {
    const user = await prisma.user.findFirst({
      where: { email: { equals: emailOrFlag, mode: "insensitive" } },
      select: { organizationId: true, email: true },
    });
    if (!user?.organizationId) {
      console.error(`לא נמצא ארגון למשתמש ${emailOrFlag}`);
      process.exit(1);
    }
    orgId = user.organizationId;
    console.log(`משתמש: ${user.email}, org: ${orgId}`);
  }

  if (!orgId) {
    console.error("ציין אימייל אדמין או --org-id");
    process.exit(1);
  }

  const updated = await prisma.organization.update({
    where: { id: orgId },
    data: {
      industry: normalizedIndustry,
      constructionTrade: specialization,
    },
    select: { id: true, name: true, industry: true, constructionTrade: true },
  });

  console.log("עודכן:", updated);
  console.log("התנתק והתחבר מחדש כדי לרענן את ה-JWT (organizationIndustry).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
