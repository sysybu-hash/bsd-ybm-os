import { NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/rate-limit";
import { withVmbAuth } from "@/lib/vmb/api";
import { studioPart } from "@/lib/vmb/studio-store";

export const dynamic = "force-dynamic";

/** The studio's model (`?part=data`) or the sheet it was measured on (`?part=sheet`), for the project's office only. */
export const GET = withVmbAuth<{ id: string }>(async (req, { user, params }) => {
  const limited = await applyRateLimit(req, "vmb:studio", 60, 60_000);
  if (limited) return limited;
  const part = new URL(req.url).searchParams.get("part") === "sheet" ? "sheet" : "data";
  const got = await studioPart(user.id, params.id, part);
  if (!got) return NextResponse.json({ code: "not_found" }, { status: 404 });
  return new NextResponse(got.body, { headers: { "content-type": got.type, "cache-control": "private, max-age=300" } });
});
