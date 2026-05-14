import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { jsonBadRequest, jsonNotFound, jsonUnauthorized } from "@/lib/api-json";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const orgId = session?.user?.organizationId;
  if (!orgId) {
    return jsonUnauthorized();
  }

  const body = await req.json();
  const contactId = body.contactId as string | undefined;
  const amount = Number(body.amount) || 0;

  if (!contactId) {
    return jsonBadRequest("חסר contactId", "missing_contact_id");
  }

  const contact = await prisma.contact.findFirst({
    where: { id: contactId, organizationId: orgId },
  });
  if (!contact) {
    return jsonNotFound("איש קשר לא נמצא");
  }

  const token = randomBytes(24).toString("hex");

  await prisma.quote.create({
    data: {
      token,
      amount,
      contactId,
      organizationId: orgId,
    },
  });

  const base =
    process.env.NEXTAUTH_URL ||
    process.env.AUTH_URL ||
    "http://localhost:3000";
  const signUrl = `${base.replace(/\/$/, "")}/sign/${token}`;

  return NextResponse.json({ signUrl, token });
}
