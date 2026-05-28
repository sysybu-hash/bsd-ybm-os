import { NextRequest, NextResponse } from "next/server";
import { isGeminiConfigured } from "@/lib/ai-providers";
import { jsonBadRequest, jsonServiceUnavailable, jsonTooManyRequests } from "@/lib/api-json";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { normalizeLocale, type AppLocale } from "@/lib/i18n/config";
import { analyzeMarketingDemoDocument } from "@/lib/marketing/demo-scan/analyze";
import {
  MARKETING_DEMO_SCAN_COOKIE,
  MARKETING_DEMO_SCAN_LIMIT,
  MARKETING_DEMO_SCAN_MAX_BYTES,
  MARKETING_DEMO_SCAN_WINDOW_MS,
} from "@/lib/marketing/demo-scan/constants";
import {
  marketingDemoScanRateLimitKey,
  readMarketingDemoVisitorId,
  resolveMarketingDemoVisitorId,
} from "@/lib/marketing/demo-scan/visitor";
import { buildMarketingPublicUrls } from "@/lib/marketing/canonical-site";
import { checkRateLimit, getRateLimitStatus } from "@/lib/rate-limit";
import { marketingDemoScanBodySchema } from "@/lib/validation/schemas/marketing-demo-scan";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 400;

function withVisitorCookie(res: NextResponse, visitorId: string, isNew: boolean): NextResponse {
  if (isNew) {
    res.cookies.set(MARKETING_DEMO_SCAN_COOKIE, visitorId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: COOKIE_MAX_AGE_SEC,
    });
  }
  return res;
}

function quotaPayload(visitorId: string) {
  const key = marketingDemoScanRateLimitKey(visitorId);
  return getRateLimitStatus(key, MARKETING_DEMO_SCAN_LIMIT, MARKETING_DEMO_SCAN_WINDOW_MS);
}

export async function GET(req: NextRequest) {
  const existing = readMarketingDemoVisitorId(req);
  const visitorId = existing ?? resolveMarketingDemoVisitorId(req);
  const status = await quotaPayload(visitorId);
  const res = NextResponse.json({
    limit: MARKETING_DEMO_SCAN_LIMIT,
    used: status.used,
    remaining: status.remaining,
    resetAt: status.resetAt.toISOString(),
  });
  return withVisitorCookie(res, visitorId, !existing);
}

export async function POST(req: NextRequest) {
  try {
    if (!isGeminiConfigured()) {
      return jsonServiceUnavailable("סריקת הדגמה אינה זמינה כרגע.", "gemini_not_configured");
    }

    const existing = readMarketingDemoVisitorId(req);
    const visitorId = existing ?? resolveMarketingDemoVisitorId(req);
    const rlKey = marketingDemoScanRateLimitKey(visitorId);
    const statusBefore = await getRateLimitStatus(
      rlKey,
      MARKETING_DEMO_SCAN_LIMIT,
      MARKETING_DEMO_SCAN_WINDOW_MS,
    );

    if (statusBefore.remaining <= 0) {
      const retryAfterSec = Math.ceil((statusBefore.resetAt.getTime() - Date.now()) / 1000);
      return jsonTooManyRequests(
        "הגעתם למכסת 2 סריקות הדגמה להיום. נסו שוב מחר או פתחו חשבון.",
        "demo_scan_daily_limit",
        { resetAt: statusBefore.resetAt.toISOString(), retryAfter: retryAfterSec },
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonBadRequest("גוף הבקשה אינו תקין.", "invalid_body");
    }

    const parsed = marketingDemoScanBodySchema.safeParse(body);
    if (!parsed.success) {
      return jsonBadRequest("קובץ לא נתמך או גדול מדי.", "invalid_body");
    }

    const buf = Buffer.from(parsed.data.imageBase64, "base64");
    if (buf.byteLength > MARKETING_DEMO_SCAN_MAX_BYTES) {
      return jsonBadRequest("הקובץ גדול מדי (מקסימום 4MB).", "file_too_large");
    }

    const locale: AppLocale = normalizeLocale(parsed.data.locale);
    const result = await analyzeMarketingDemoDocument({
      locale,
      fileName: parsed.data.fileName,
      mimeType: parsed.data.mimeType,
      imageBase64: parsed.data.imageBase64,
    });

    const rl = await checkRateLimit(
      `rl:${rlKey}`,
      MARKETING_DEMO_SCAN_LIMIT,
      MARKETING_DEMO_SCAN_WINDOW_MS,
    );

    if (!rl.success) {
      return jsonTooManyRequests(
        "הגעתם למכסת 2 סריקות הדגמה להיום.",
        "demo_scan_daily_limit",
        { resetAt: rl.resetAt.toISOString() },
      );
    }

    const urls = buildMarketingPublicUrls();
    const res = NextResponse.json({
      extraction: result.extraction,
      summary: result.summary,
      confidence: result.confidence,
      assumptions: result.assumptions,
      remaining: rl.remaining,
      limit: MARKETING_DEMO_SCAN_LIMIT,
      resetAt: rl.resetAt.toISOString(),
      registerUrl: urls.register,
    });

    return withVisitorCookie(res, visitorId, !existing);
  } catch (err: unknown) {
    return apiErrorResponse(err, "api/marketing/demo-scan");
  }
}
