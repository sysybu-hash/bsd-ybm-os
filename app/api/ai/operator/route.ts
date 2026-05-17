import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";
import { apiErrorResponse } from "@/lib/api-route-helpers";

type AgentResponse = {
  reply: string;
  requiresConfirmation?: boolean;
  suggestedAction?: string;
};

const operatorBodySchema = z.object({
  message: z.string().optional(),
  confirm: z.boolean().optional(),
});

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

function isDangerousIntent(text: string): boolean {
  return /(מחק|delete|drop|reset|אפס|בטל|disable|השבת|שנה סיסמה|set password)/i.test(text);
}

export const POST = withWorkspacesAuth(
  async (_req, { userId, orgId }, data) => {
    try {
      const msg = typeof data.message === "string" ? data.message.trim() : "";
      const confirm = data.confirm === true;

      if (!msg) {
        return NextResponse.json({ reply: "כתוב לי משימה תפעולית ואבצע." } satisfies AgentResponse);
      }

      if (isDangerousIntent(msg) && !confirm) {
        await logActivity(userId, orgId, "WIZARD:operator_guard_block", `message=${msg.slice(0, 120)}`);
        return NextResponse.json({
          reply:
            "זוהתה פעולה רגישה. כדי להמשיך, שלח שוב עם אישור מפורש. אני ממליץ קודם לבצע מצב תצוגה בלבד.",
          requiresConfirmation: true,
          suggestedAction: "אשר פעולה רגישה",
        } satisfies AgentResponse);
      }

      const text = normalize(msg);

      if (/סטטוס מערכת|health|system/.test(text)) {
        const [usersActive, docs30] = await Promise.all([
          prisma.user.count({ where: { organizationId: orgId, accountStatus: "ACTIVE" } }),
          prisma.document.count({
            where: {
              organizationId: orgId,
              createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
            },
          }),
        ]);
        const reply = `סטטוס מערכת: תקין. משתמשים פעילים: ${usersActive}. מסמכים ב-30 ימים: ${docs30}.`;
        await logActivity(userId, orgId, "WIZARD:operator_system_status", reply);
        return NextResponse.json({ reply } satisfies AgentResponse);
      }

      if (/מנוי|billing|subscription/.test(text)) {
        const org = await prisma.organization.findUnique({
          where: { id: orgId },
          select: {
            subscriptionTier: true,
            subscriptionStatus: true,
            trialEndsAt: true,
            cheapScansRemaining: true,
            premiumScansRemaining: true,
          },
        });
        if (!org) {
          return NextResponse.json({ reply: "לא נמצא ארגון משויך למשתמש." } satisfies AgentResponse);
        }
        const reply = `מנוי: ${org.subscriptionTier} | סטטוס: ${org.subscriptionStatus} | סריקות זולות: ${org.cheapScansRemaining} | סריקות פרימיום: ${org.premiumScansRemaining} | סיום ניסיון: ${org.trialEndsAt ? new Intl.DateTimeFormat("he-IL").format(org.trialEndsAt) : "לא זמין"}.`;
        await logActivity(userId, orgId, "WIZARD:operator_subscription_status", reply);
        return NextResponse.json({ reply } satisfies AgentResponse);
      }

      if (/משתמשים|users|team|צוות/.test(text)) {
        const users = await prisma.user.findMany({
          where: { organizationId: orgId },
          orderBy: { createdAt: "desc" },
          take: 8,
          select: { email: true, role: true, accountStatus: true },
        });
        if (users.length === 0) {
          return NextResponse.json({ reply: "לא נמצאו משתמשים בארגון." } satisfies AgentResponse);
        }
        const list = users
          .map((u) => `- ${u.email ?? "ללא אימייל"} | ${u.role} | ${u.accountStatus}`)
          .join("\n");
        const reply = `משתמשים אחרונים בארגון:\n${list}`;
        await logActivity(userId, orgId, "WIZARD:operator_users_list", `count=${users.length}`);
        return NextResponse.json({ reply } satisfies AgentResponse);
      }

      if (/תזכורת|reminder|invoice/.test(text)) {
        const pendingCount = await prisma.invoice.count({
          where: { organizationId: orgId, status: "PENDING" },
        });
        const reply =
          pendingCount > 0
            ? `נמצאו ${pendingCount} חשבוניות ממתינות. המלצה: עבור למסך Billing ושלח תזכורת גבייה.`
            : "אין כרגע חשבוניות ממתינות.";
        await logActivity(userId, orgId, "WIZARD:operator_invoice_reminder_check", `pending=${pendingCount}`);
        return NextResponse.json({ reply } satisfies AgentResponse);
      }

      await logActivity(userId, orgId, "WIZARD:operator_fallback", msg.slice(0, 200));
      return NextResponse.json({
        reply:
          "אני מוכן לבצע כרגע: סטטוס מערכת, מצב מנוי, רשימת משתמשים ובדיקת חשבוניות ממתינות. נסח בקשה קצרה באחד התחומים.",
      } satisfies AgentResponse);
    } catch (err: unknown) {
      return apiErrorResponse(err, "api/ai/operator");
    }
  },
  { schema: operatorBodySchema },
);
