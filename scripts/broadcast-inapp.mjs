/**
 * התראה פנימית (פעמון) לכל המשתמשים בחשבון ACTIVE — כמו /api/admin/broadcast-notification.
 *
 * דמה (ספירה בלבד):
 *   node scripts/broadcast-inapp.mjs --dry-run --title="..." --body="..."
 *
 * שליחה אמיתית:
 *   node scripts/broadcast-inapp.mjs --yes --title="..." --body="..."
 *
 * או: npm run broadcast:inapp -- --yes --title="כותרת" --body="טקסט"
 */

import { config } from "dotenv";
import { resolve } from "node:path";
import { AccountStatus, PrismaClient } from "@prisma/client";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const prisma = new PrismaClient();
const CHUNK = 400;
const TITLE_MAX = 160;
const BODY_MAX = 4000;

function argVal(prefix) {
  const a = process.argv.find((x) => x.startsWith(prefix));
  return a ? a.slice(prefix.length).trim() : "";
}

const title = argVal("--title=");
const body = argVal("--body=");
const dryRun = process.argv.includes("--dry-run");
const yes = process.argv.includes("--yes");

async function main() {
  if (!title || !body) {
    console.error("חובה: --title=\"...\" ו־--body=\"...\"");
    process.exit(1);
  }
  if (title.length > TITLE_MAX || body.length > BODY_MAX) {
    console.error("כותרת או גוף ארוכים מדי (מקסימום כותרת 160, גוף 4000)");
    process.exit(1);
  }
  if (!dryRun && !yes) {
    console.error("הוסף --dry-run לספירה או --yes לשליחה אמיתית");
    process.exit(1);
  }

  const users = await prisma.user.findMany({
    where: { accountStatus: AccountStatus.ACTIVE },
    select: { id: true },
  });

  if (dryRun) {
    console.log(`[dry-run] יישלח ל־${users.length} משתמשים ACTIVE`);
    process.exit(0);
  }

  for (let i = 0; i < users.length; i += CHUNK) {
    const slice = users.slice(i, i + CHUNK);
    await prisma.inAppNotification.createMany({
      data: slice.map((u) => ({ userId: u.id, title, body })),
    });
  }

  console.log(`נוצרו התראות ל־${users.length} משתמשים.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
