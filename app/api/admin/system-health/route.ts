import { NextResponse } from "next/server";
import { withOSAdmin } from "@/lib/api-handler";
import { getAdminSystemHealth } from "@/lib/admin-assistant/system-health";

export const GET = withOSAdmin(async () => {
  const health = await getAdminSystemHealth();
  return NextResponse.json(health);
});
