import "server-only";
import { NextResponse } from "next/server";
import { createVmbSession, sessionCookieOptions, VMB_SESSION_COOKIE } from "@/lib/vmb/session";

/** A JSON reply that also signs the user in (sets a fresh session cookie). */
export async function signedInJson(userId: string, body: Record<string, unknown> = { ok: true }): Promise<NextResponse> {
  const { token, maxAgeSec } = await createVmbSession(userId);
  const res = NextResponse.json(body);
  res.cookies.set(VMB_SESSION_COOKIE, token, sessionCookieOptions(maxAgeSec));
  return res;
}

export function authError(code: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, code }, { status });
}
