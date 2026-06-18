import { NextResponse } from "next/server";
import { z } from "zod";
import { withOSAdmin } from "@/lib/api-handler";
import { jsonBadRequest } from "@/lib/api-json";
import { getAdminEnvStatusRecord } from "@/lib/admin/env-status";
import {
  getPlatformConfig,
  platformConfigSchema,
  updatePlatformConfig,
} from "@/lib/platform-settings";

export const dynamic = "force-dynamic";

export const GET = withOSAdmin(async () => {
  const config = await getPlatformConfig(true);
  const envStatus = getAdminEnvStatusRecord();
  return NextResponse.json({ config, envStatus });
});

const patchSchema = platformConfigSchema.partial();

export const PATCH = withOSAdmin(async (req) => {
  const raw = (await req.json().catch(() => null)) as unknown;
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonBadRequest("נתוני הגדרות לא תקינים", "invalid_config");
  }
  const config = await updatePlatformConfig(parsed.data);
  return NextResponse.json({ config });
});
