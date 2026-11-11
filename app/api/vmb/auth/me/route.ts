import { NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/rate-limit";
import { withVmbAuth } from "@/lib/vmb/api";

export const dynamic = "force-dynamic";

export const GET = withVmbAuth(async (req, { user }) => {
  const limited = await applyRateLimit(req, "vmb:me", 120, 60_000);
  if (limited) return limited;
  return NextResponse.json({ user });
});
