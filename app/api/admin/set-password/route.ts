import { NextResponse } from "next/server";
import { withOSAdmin } from "@/lib/api-handler";
import { jsonBadRequest, jsonNotFound } from "@/lib/api-json";
import { hashPassword, validatePasswordStrength } from "@/lib/password";
import { prisma } from "@/lib/prisma";

export const POST = withOSAdmin(async (req) => {
  const body = await req.json().catch(() => null);
  const email = (body?.email ?? "").trim().toLowerCase();
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email) {
    return jsonBadRequest("נדרש אימייל תקין.", "invalid_credentials_payload");
  }

  const strength = validatePasswordStrength(password);
  if (!strength.ok) {
    return jsonBadRequest(strength.message, "weak_password");
  }

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, email: true },
  });

  if (!user) {
    return jsonNotFound("משתמש לא נמצא.");
  }

  const hashed = await hashPassword(password);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hashed },
  });

  return NextResponse.json({
    ok: true,
    message: `Password set for ${user.email}`,
  });
});
