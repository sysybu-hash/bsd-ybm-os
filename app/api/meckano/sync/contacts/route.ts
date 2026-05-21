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

  // Build name + email for each employee
  const mapped = employees.map((emp) => ({
    emp,
    name:
      [emp.firstName, emp.lastName].filter(Boolean).join(" ") ||
      emp.workerTag ||
      emp.email ||
      `עובד #${emp.id}`,
    email: typeof emp.email === "string" ? emp.email.trim() : "",
  }));

  // --- N+1 fix: batch-load all existing contacts in ONE query ---
  const allEmails = mapped.map((m) => m.email).filter(Boolean) as string[];
  const allNames = mapped.map((m) => m.name);

  const existingContacts = await prisma.contact.findMany({
    where: {
      organizationId: orgId,
      OR: [
        allEmails.length > 0 ? { email: { in: allEmails } } : undefined,
        { name: { in: allNames } },
      ].filter(Boolean) as Array<{ email: { in: string[] } } | { name: { in: string[] } }>,
    },
    select: { id: true, email: true, name: true },
  });

  const byEmail = new Map(existingContacts.filter((c) => c.email).map((c) => [c.email!, c]));
  const byName = new Map(existingContacts.map((c) => [c.name, c]));

  const toCreate: Array<{ name: string; email: string | null; organizationId: string; status: "ACTIVE" }> = [];
  const toUpdate: Array<{ id: string; name: string; email: string | null }> = [];

  for (const { emp, name, email } of mapped) {
    const existing = (email ? byEmail.get(email) : undefined) ?? byName.get(name);
    if (existing) {
      toUpdate.push({ id: existing.id, name, email: emp.email ?? existing.email ?? null });
    } else {
      toCreate.push({ name, email: emp.email ?? null, organizationId: orgId, status: "ACTIVE" });
    }
  }

  // Batch updates — Prisma doesn't support updateMany with per-row data, so use transaction
  await prisma.$transaction([
    ...toUpdate.map(({ id, name, email }) =>
      prisma.contact.update({ where: { id }, data: { name, email } }),
    ),
    toCreate.length > 0
      ? prisma.contact.createMany({ data: toCreate, skipDuplicates: true })
      : prisma.$queryRaw`SELECT 1`,
  ]);

  return NextResponse.json({ synced: toCreate.length + toUpdate.length });
});
