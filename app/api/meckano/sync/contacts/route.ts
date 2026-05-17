import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { jsonForbidden } from "@/lib/api-json";
import { getAuthorizedMeckanoOrganizationId, MECKANO_ACCESS_ERROR } from "@/lib/meckano-access";
import { meckanoSessionFromWorkspace } from "@/lib/meckano-route-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type MeckanoEmployee = {
  id: number;
  email?: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  workerTag?: string | null;
  role?: string | null;
};

export const POST = withWorkspacesAuth(async (req, ctx) => {
  const sessionLike = await meckanoSessionFromWorkspace(ctx);
  const orgId = await getAuthorizedMeckanoOrganizationId(sessionLike);
  if (!orgId) {
    return jsonForbidden(MECKANO_ACCESS_ERROR);
  }

  const body = (await req.json()) as { employees?: MeckanoEmployee[] };
  const employees = body.employees ?? [];
  if (!employees.length) {
    return NextResponse.json({ synced: 0 });
  }

  let synced = 0;
  for (const emp of employees) {
    const name =
      [emp.firstName, emp.lastName].filter(Boolean).join(" ") ||
      emp.workerTag ||
      emp.email ||
      `עובד #${emp.id}`;

    const email = typeof emp.email === "string" ? emp.email.trim() : "";
    const orWhere: Array<{ email: string } | { name: string }> = [];
    if (email) orWhere.push({ email });
    orWhere.push({ name });

    const existing = await prisma.contact.findFirst({
      where: { organizationId: orgId, OR: orWhere },
    });

    if (existing) {
      await prisma.contact.update({
        where: { id: existing.id },
        data: { name, email: emp.email ?? existing.email },
      });
    } else {
      await prisma.contact.create({
        data: {
          name,
          email: emp.email ?? null,
          organizationId: orgId,
          status: "ACTIVE",
        },
      });
    }
    synced++;
  }

  return NextResponse.json({ synced });
});
