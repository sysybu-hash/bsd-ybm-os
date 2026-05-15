import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { canAccessMeckano, MECKANO_ACCESS_ERROR } from "@/lib/meckano-access";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ allowed: false, reason: "unauthorized" }, { status: 401 });
  }
  const allowed = await canAccessMeckano(session);
  const configured = Boolean(process.env.MECKANO_API_KEY?.trim());
  return NextResponse.json({
    allowed,
    configured,
    message: allowed ? null : MECKANO_ACCESS_ERROR,
  });
}
