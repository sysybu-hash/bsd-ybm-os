import { NextResponse } from "next/server";
import { withOSAdmin } from "@/lib/api-handler";
import { jsonBadRequest } from "@/lib/api-json";
import { prisma } from "@/lib/prisma";

export const GET = withOSAdmin(async (req) => {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email")?.trim().toLowerCase();
  if (!email) {
    return jsonBadRequest("חסר פרמטר email.", "missing_email");
  }

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      accountStatus: true,
      organizationId: true,
      lastLoginAt: true,
    },
  });

  if (!user) return NextResponse.json({ found: false });

  return NextResponse.json({ found: true, user });
});
