import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { jsonBadRequest, jsonServerError } from "@/lib/api-json";
import { sendPasswordResetEmail } from "@/lib/mail";
import { applyRateLimit } from "@/lib/rate-limit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  // 5 ניסיונות לדקה per IP — מגן על email enumeration + spam
  const limited = await applyRateLimit(req, "auth:forgot-password", 5, 60_000);
  if (limited) return limited;
  try {
    const body = (await req.json().catch(() => ({}))) as { email?: string };
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      return jsonBadRequest("אימייל לא תקין");
    }

    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true, passwordHash: true },
    });

    /** תמיד תשובה זהה — מניעת enumeration */
    const generic = NextResponse.json({
      ok: true,
      message: "אם החשבון קיים, נשלח קישור לאיפוס סיסמה.",
    });

    if (!user?.passwordHash) return generic;

    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    void sendPasswordResetEmail(email, token).catch((err) =>
      console.error("sendPasswordResetEmail", err),
    );

    return generic;
  } catch (e) {
    console.error("forgot-password", e);
    return jsonServerError();
  }
}
