import { NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/rate-limit";
import { withVmbAuth } from "@/lib/vmb/api";
import { studioPart } from "@/lib/vmb/studio-store";

export const dynamic = "force-dynamic";

/** The studio's model (`?part=data`) or a sheet it was measured on (`?part=sheet`, `&key=` a storey's), for the project's office only. */
export const GET = withVmbAuth<{ id: string }>(async (req, { user, params }) => {
  const limited = await applyRateLimit(req, "vmb:studio", 60, 60_000);
  if (limited) return limited;
  const q = new URL(req.url).searchParams;
  const part = q.get("part") === "sheet" ? "sheet" : "data";
  const key = q.get("key");
  const got = await studioPart(user.id, params.id, part, key && /^[\w-]{1,80}$/.test(key) ? key : undefined);
  if (!got) return NextResponse.json({ code: "not_found" }, { status: 404 });
  return new NextResponse(got.body, { headers: { "content-type": got.type, "cache-control": "private, max-age=300" } });
});
