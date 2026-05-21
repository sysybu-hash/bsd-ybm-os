import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonUnauthorized, jsonServerError } from "@/lib/api-json";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return jsonUnauthorized();
    const rows = await prisma.userPasskey.findMany({
      where: { userId },
      select: { id: true, deviceName: true, createdAt: true, lastUsedAt: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ ok: true, passkeys: rows });
  } catch (e) {
    console.error("passkey list", e);
    return jsonServerError();
  }
}
