import { NextResponse } from "next/server";
import { withOSAdmin } from "@/lib/api-handler";

export const POST = withOSAdmin(async (req) => {
  const body = await req.json().catch(() => ({}));
  void body;

  return NextResponse.json({
    message: "Self-healing is configured as a manual-only stub in this environment.",
    status: "skipped",
  });
});
