"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAdmin } from "@/lib/is-admin";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { z } from "zod";
import type { AppBuilderUiSchema } from "@/lib/validation/schemas/app-builder";
import { appBuilderUiSchema } from "@/lib/validation/schemas/app-builder";

const log = createLogger("app-ideas-actions");

const submitInputSchema = z.object({
  appName: z.string().min(1).max(120),
  appType: z.string().min(1).max(40),
  uiSchema: appBuilderUiSchema,
});

/** מנוי בוחר לשתף את הרעיון שלו — ללא נתוני ארגון/משתמש */
export async function submitAppIdeaAction(input: {
  appName: string;
  appType: string;
  uiSchema: AppBuilderUiSchema;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return { ok: false as const, error: "נדרשת התחברות" };

  const parsed = submitInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "נתונים לא תקינים" };

  // קבל את תעשיית הארגון בלבד — לקטגוריזציה אנונימית
  let orgIndustry: string | null = null;
  if (session.user.organizationId) {
    const org = await prisma.organization.findUnique({
      where: { id: session.user.organizationId },
      select: { industry: true },
    });
    orgIndustry = org?.industry ?? null;
  }

  try {
    await prisma.appIdeaSubmission.create({
      data: {
        appName: parsed.data.appName.trim(),
        appType: parsed.data.appType,
        uiSchema: parsed.data.uiSchema as object,
        orgIndustry,
        status: "pending",
      },
    });
    return { ok: true as const };
  } catch (err: unknown) {
    log.error("submit_idea_failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    return { ok: false as const, error: "שמירת הרעיון נכשלה" };
  }
}

// ─── Admin actions ────────────────────────────────────────────

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return { error: "אין הרשאה" as const };
  }
  return { ok: true as const };
}

export type AppIdeaItem = {
  id: string;
  appName: string;
  appType: string;
  status: string;
  orgIndustry: string | null;
  createdAt: Date;
  uiSchema: unknown;
};

export async function listAppIdeasAction(status?: string) {
  const auth = await requireAdmin();
  if ("error" in auth) return { ok: false as const, error: auth.error };

  try {
    const ideas = await prisma.appIdeaSubmission.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        appName: true,
        appType: true,
        status: true,
        orgIndustry: true,
        createdAt: true,
        uiSchema: true,
      },
    });
    return { ok: true as const, ideas: ideas as AppIdeaItem[] };
  } catch (err: unknown) {
    log.error("list_ideas_failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    return { ok: false as const, error: "טעינת הרעיונות נכשלה. ייתכן שהטבלה לא קיימת עדיין." };
  }
}

export async function updateAppIdeaStatusAction(id: string, status: "pending" | "approved" | "rejected") {
  const auth = await requireAdmin();
  if ("error" in auth) return { ok: false as const, error: auth.error };

  await prisma.appIdeaSubmission.update({
    where: { id },
    data: { status },
  });

  return { ok: true as const };
}

/** מקדם רעיון מאושר לתבנית גלובלית — זמינה לכל המנויים */
export async function promoteIdeaToGlobalTemplateAction(id: string) {
  const auth = await requireAdmin();
  if ("error" in auth) return { ok: false as const, error: auth.error };

  const idea = await prisma.appIdeaSubmission.findUnique({
    where: { id },
    select: { appName: true, uiSchema: true },
  });
  if (!idea) return { ok: false as const, error: "רעיון לא נמצא" };

  try {
    const schema = await prisma.customAppSchema.create({
      data: {
        organizationId: null,
        name: idea.appName,
        uiSchema: idea.uiSchema as object,
        isGlobal: true,
      },
      select: { id: true },
    });

    await prisma.appIdeaSubmission.update({
      where: { id },
      data: { status: "approved" },
    });

    return { ok: true as const, schemaId: schema.id };
  } catch (err: unknown) {
    log.error("promote_idea_failed", {
      id,
      message: err instanceof Error ? err.message : String(err),
    });
    return { ok: false as const, error: "קידום הרעיון נכשל" };
  }
}
