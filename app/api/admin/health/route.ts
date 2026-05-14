import { NextResponse } from "next/server";
import { withOSAdmin } from "@/lib/api-handler";

export const dynamic = "force-dynamic";

export const GET = withOSAdmin(async () => {
  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    services: {
      database: "mocked_ok",
      ai_workers: "mocked_ok",
      pwa_sync: "mocked_ok",
    },
  });
});
