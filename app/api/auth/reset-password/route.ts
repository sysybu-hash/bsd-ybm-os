import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { jsonBadRequest, jsonServerError } from "@/lib/api-json";
import { hashPassword, validatePasswordStrength } from "@/lib/password";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as { token?: string; password?: string };
    const token = String(body?.token ?? "").trim();
    const password = typeof body?.password === "string" ? body.password : "";
    if (!token) return jsonBadRequest("קישור לא תקף");

    const strength = validatePasswordStrength(password);
    if (!strength.ok) return jsonBadRequest(strength.message, "weak_password");

    const tokenHash = createHash("sha256").update(token).digest("hex");
    const row = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true } } },
    });
    if (!row || row.expiresAt.getTime() < Date.now()) {
      return jsonBadRequest("הקישור פג תוקף. בקשו איפוס סיסמה מחדש.");
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: row.userId },
        data: { passwordHash: await hashPassword(password) },
      }),
      prisma.passwordResetToken.delete({ where: { id: row.id } }),
    ]);

    return NextResponse.json({ ok: true, message: "הסיסמה עודכנה. ניתן להתחבר." });
  } catch (e) {
    console.error("reset-password", e);
    return jsonServerError();
  }
}
