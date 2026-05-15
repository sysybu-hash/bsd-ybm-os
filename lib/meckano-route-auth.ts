import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { canAccessMeckano, MECKANO_ACCESS_ERROR } from "@/lib/meckano-access";

export async function requireMeckanoSession(session: Session | null) {
  if (!session?.user) {
    return {
      error: NextResponse.json({ error: "Unauthorized", code: "unauthorized" }, { status: 401 }),
    };
  }
  if (!(await canAccessMeckano(session))) {
    return {
      error: NextResponse.json(
        { error: MECKANO_ACCESS_ERROR, code: "meckano_forbidden" },
        { status: 403 },
      ),
    };
  }
  const apiKey = process.env.MECKANO_API_KEY?.trim();
  if (!apiKey) {
    return {
      error: NextResponse.json(
        { error: "Meckano API Key is not configured", code: "meckano_not_configured" },
        { status: 503 },
      ),
    };
  }
  return { apiKey };
}
