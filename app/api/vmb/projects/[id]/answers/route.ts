import { NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/rate-limit";
import { vmbAnswersBodySchema } from "@/lib/validation/schemas/vmb-projects";
import { isSameOrigin, withVmbAuth } from "@/lib/vmb/api";
import { saveAnswers } from "@/lib/vmb/answers-store";

export const dynamic = "force-dynamic";

/** Saves the project's questions form; an empty `answers` confirms every default and every value the files gave. */
export const PUT = withVmbAuth<{ id: string }>(async (req, { user, params }) => {
  if (!isSameOrigin(req)) return NextResponse.json({ code: "forbidden" }, { status: 403 });
  const limited = await applyRateLimit(req, "vmb:answers", 60, 60_000);
  if (limited) return limited;
  const parsed = vmbAnswersBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: "bad_request" }, { status: 400 });
  const state = await saveAnswers(user.id, params.id, parsed.data.answers);
  return state ? NextResponse.json(state) : NextResponse.json({ code: "not_found" }, { status: 404 });
});
