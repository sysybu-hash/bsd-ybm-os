import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { jsonBadRequest, jsonForbidden, jsonUnauthorized } from "@/lib/api-json";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/is-admin";
import type { UserRole } from "@prisma/client";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return jsonUnauthorized();
  }

  const isOSOwner = isAdmin(session.user.email);
  /** הרשאות לפי סשן (אחרי jwtRoleForSession) — לא לפי role גולמי ב-DB */
  const sessionRole = String(session.user.role ?? "");
  const sessionOrgId = session.user.organizationId ?? null;
  const isOrgLead = isOSOwner || sessionRole === "ORG_ADMIN";

  const body = (await req.json()) as {
    email?: string;
    organizationId?: string;
    role?: string;
  };
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const organizationId = typeof body.organizationId === "string" ? body.organizationId : "";

  if (!email || !organizationId) {
    return jsonBadRequest("חסר אימייל או מזהה ארגון", "missing_email_or_org");
  }

  if (!isOrgLead) {
    return jsonForbidden("רק מנהל ארגון רשאי לשייך משתמשים לצוות");
  }

  if (!isOSOwner && sessionOrgId !== organizationId) {
    return jsonForbidden("אסור לשייך מחוץ לארגון שלך");
  }

  if (isAdmin(email)) {
    return jsonForbidden("לא ניתן לשנות שיוך ארגון למשתמשי מפתח מערכת.");
  }

  let newRole: UserRole = "EMPLOYEE";
  const r = String(body.role ?? "").trim();
  if (r === "ORG_ADMIN" && isOrgLead) {
    newRole = "ORG_ADMIN";
  } else if (r === "PROJECT_MGR" && isOrgLead) {
    newRole = "PROJECT_MGR";
  } else if (r === "CLIENT" && isOrgLead) {
    newRole = "CLIENT";
  } else if (r === "EMPLOYEE") {
    newRole = "EMPLOYEE";
  }

  try {
    const updatedUser = await prisma.user.update({
      where: { email },
      data: { organizationId, role: newRole, accountStatus: "ACTIVE" },
    });

    return NextResponse.json({ success: true, user: updatedUser.name, role: updatedUser.role });
  } catch {
    return jsonBadRequest(
      "המשתמש חייב להתחבר למערכת לפחות פעם אחת לפני השיוך",
      "user_not_ready",
    );
  }
}

