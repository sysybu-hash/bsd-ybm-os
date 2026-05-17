import { NextResponse } from "next/server";
import { z } from "zod";
import type { UserRole } from "@prisma/client";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { jsonBadRequest, jsonForbidden } from "@/lib/api-json";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/is-admin";
const assignUserBodySchema = z.object({
  email: z.string().min(1),
  organizationId: z.string().min(1),
  role: z.string().optional(),
});

export const POST = withWorkspacesAuth(async (_req, ctx, data) => {
  try {
    const actor = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { email: true },
    });
    const actorEmail = actor?.email;

    const isOSOwner = isAdmin(actorEmail);
    const isOrgLead = isOSOwner || ctx.role === "ORG_ADMIN";

    const email = data.email.trim();
    const organizationId = data.organizationId;

    if (!isOrgLead) {
      return jsonForbidden("רק מנהל ארגון רשאי לשייך משתמשים לצוות");
    }

    if (!isOSOwner && ctx.orgId !== organizationId) {
      return jsonForbidden("אסור לשייך מחוץ לארגון שלך");
    }

    if (isAdmin(email)) {
      return jsonForbidden("לא ניתן לשנות שיוך ארגון למשתמשי מפתח מערכת.");
    }

    let newRole: UserRole = "EMPLOYEE";
    const r = String(data.role ?? "").trim();
    if (r === "ORG_ADMIN" && isOrgLead) {
      newRole = "ORG_ADMIN";
    } else if (r === "PROJECT_MGR" && isOrgLead) {
      newRole = "PROJECT_MGR";
    } else if (r === "CLIENT" && isOrgLead) {
      newRole = "CLIENT";
    } else if (r === "EMPLOYEE") {
      newRole = "EMPLOYEE";
    }

    const updatedUser = await prisma.user.update({
      where: { email },
      data: { organizationId, role: newRole, accountStatus: "ACTIVE" },
    });

    return NextResponse.json({ success: true, user: updatedUser.name, role: updatedUser.role });
  } catch (err: unknown) {
    return jsonBadRequest(
      "המשתמש חייב להתחבר למערכת לפחות פעם אחת לפני השיוך",
      "user_not_ready",
    );
  }
}, { schema: assignUserBodySchema });
