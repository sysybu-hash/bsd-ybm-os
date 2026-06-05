import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { searchLocations } from "@/lib/jewish-calendar/locations";

export const GET = withWorkspacesAuth(async (req) => {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  const limitRaw = searchParams.get("limit");
  const limit = limitRaw ? Math.min(50, Math.max(1, Number(limitRaw) || 20)) : 20;
  const locations = searchLocations(q, limit);
  return NextResponse.json({ locations });
});
