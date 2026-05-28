import { NextRequest, NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { sendSiteFeedbackEmail } from "@/lib/mail";
import { siteFeedbackSchema } from "@/lib/validation/schemas/site-feedback";

const log = createLogger("api:feedback");

export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req, "feedback:submit", 5, 60_000);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn("feedback invalid json", { error: msg });
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = siteFeedbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const result = await sendSiteFeedbackEmail(parsed.data);
  if (!result.ok) {
    log.error("feedback email failed", { error: result.error });
    return NextResponse.json({ error: "send_failed" }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
