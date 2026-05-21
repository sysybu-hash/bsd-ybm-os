import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { jsonUnauthorized, jsonServerError } from "@/lib/api-json";
import { createPasskeyRegistrationOptions } from "@/lib/auth/passkey-server";

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    const email = session?.user?.email;
    if (!userId || !email) return jsonUnauthorized();
    const options = await createPasskeyRegistrationOptions(userId, email);
    return NextResponse.json({ ok: true, options });
  } catch (e) {
    console.error("passkey register-options", e);
    return jsonServerError("שגיאה בהכנת רישום Passkey");
  }
}
