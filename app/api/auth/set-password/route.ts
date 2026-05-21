import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { jsonBadRequest, jsonUnauthorized, jsonServerError } from "@/lib/api-json";
import { hashPassword, validatePasswordStrength } from "@/lib/password";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return jsonUnauthorized();
    const body = (await req.json().catch(() => null)) as {
      password?: string;
      currentPassword?: string;
    };
    const password = typeof body?.password === "string" ? body.password : "";
    const strength = validatePasswordStrength(password);
    if (!strength.ok) return jsonBadRequest(strength.message, "weak_password");

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!user) return jsonUnauthorized();

    if (user.passwordHash && body?.currentPassword) {
      const { verifyPassword } = await import("@/lib/password");
      const ok = await verifyPassword(body.currentPassword, user.passwordHash);
      if (!ok) return jsonBadRequest("הסיסמה הנוכחית שגויה");
    } else if (user.passwordHash && !body?.currentPassword) {
      return jsonBadRequest("נדרשת הסיסמה הנוכחית");
    }

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(password) },
    });
    return NextResponse.json({ ok: true, message: "הסיסמה עודכנה" });
  } catch (e) {
    console.error("set-password", e);
    return jsonServerError();
  }
}
