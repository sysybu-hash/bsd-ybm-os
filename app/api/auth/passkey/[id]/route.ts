import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonNotFound, jsonUnauthorized, jsonServerError } from "@/lib/api-json";
import { createLogger } from "@/lib/logger";

const log = createLogger("auth-passkey-delete");

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return jsonUnauthorized();
    const { id } = await params;
    const row = await prisma.userPasskey.findFirst({
      where: { id, userId },
    });
    if (!row) return jsonNotFound("מכשיר לא נמצא");
    await prisma.userPasskey.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error("passkey delete failed", { error: e instanceof Error ? e.message : String(e) });
    return jsonServerError();
  }
}
