/**
 * מנרמל רשומות User במסד: SUPER_ADMIN מותר רק לבעל הפלטפורמה (STEEL_ADMIN_EMAIL או sysybu@gmail.com).
 * כל שאר SUPER_ADMIN ב־DB יורדים ל־ORG_ADMIN (שומר ניהול ארגון, בלי מפתח פלטפורמה).
 *
 * הרצה: node scripts/demote-non-steel-super-admins.mjs
 */
import { PrismaClient } from "@prisma/client";

const STEEL = (process.env.STEEL_ADMIN_EMAIL || "sysybu@gmail.com").trim().toLowerCase();
const prisma = new PrismaClient();

async function main() {
  const victims = await prisma.user.findMany({
    where: {
      role: "SUPER_ADMIN",
      NOT: { email: { equals: STEEL, mode: "insensitive" } },
    },
    select: { id: true, email: true },
  });

  if (victims.length === 0) {
    console.log(JSON.stringify({ ok: true, demoted: 0, message: "אין SUPER_ADMIN שגויים" }, null, 2));
    return;
  }

  const r = await prisma.user.updateMany({
    where: { id: { in: victims.map((v) => v.id) } },
    data: { role: "ORG_ADMIN" },
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        demoted: r.count,
        emails: victims.map((v) => v.email),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
