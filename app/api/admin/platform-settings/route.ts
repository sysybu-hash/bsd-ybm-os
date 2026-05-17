import { NextResponse } from "next/server";
import { z } from "zod";
import { withOSAdmin } from "@/lib/api-handler";
import { jsonBadRequest } from "@/lib/api-json";
import {
  getPlatformConfig,
  platformConfigSchema,
  updatePlatformConfig,
} from "@/lib/platform-settings";

export const dynamic = "force-dynamic";

export const GET = withOSAdmin(async () => {
  const config = await getPlatformConfig(true);
  const envStatus = {
    cronSecret: Boolean(process.env.CRON_SECRET?.trim()),
    analyzeQueueSecret: Boolean(process.env.ANALYZE_QUEUE_SECRET?.trim()),
    googleAi: Boolean(
      process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim(),
    ),
    openai: Boolean(process.env.OPENAI_API_KEY?.trim()),
    nextAuthSecret: Boolean(process.env.NEXTAUTH_SECRET?.trim() || process.env.AUTH_SECRET?.trim()),
  };
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
