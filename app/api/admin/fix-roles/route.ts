import { NextResponse } from "next/server";
import { withOSAdmin } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";

export const POST = withOSAdmin(async (_req, { email: adminEmail }) => {
  const wrongSuperAdmins = await prisma.user.findMany({
    where: {
      role: "SUPER_ADMIN",
      NOT: { email: { equals: adminEmail, mode: "insensitive" } },
    },
    select: { id: true, email: true, role: true },
  });

  if (wrongSuperAdmins.length === 0) {
    return NextResponse.json({ fixed: 0, message: "כל התפקידים תקינים." });
  }

  const ids = wrongSuperAdmins.map((u) => u.id);
  await prisma.user.updateMany({
    where: { id: { in: ids } },
    data: { role: "ORG_ADMIN" },
  });

  return NextResponse.json({
    fixed: wrongSuperAdmins.length,
    users: wrongSuperAdmins.map((u) => ({ email: u.email, wasRole: u.role, nowRole: "ORG_ADMIN" })),
    message: `תוקנו ${wrongSuperAdmins.length} משתמשים.`,
  });
});
