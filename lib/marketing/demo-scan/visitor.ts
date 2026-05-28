import { randomUUID } from "crypto";
import type { NextRequest } from "next/server";
import { MARKETING_DEMO_SCAN_COOKIE } from "@/lib/marketing/demo-scan/constants";

const VISITOR_ID_RE = /^[a-zA-Z0-9_-]{8,64}$/;

export function readMarketingDemoVisitorId(req: NextRequest): string | null {
  const raw = req.cookies.get(MARKETING_DEMO_SCAN_COOKIE)?.value?.trim();
  if (!raw || !VISITOR_ID_RE.test(raw)) return null;
  return raw;
}

export function resolveMarketingDemoVisitorId(req: NextRequest): string {
  return readMarketingDemoVisitorId(req) ?? randomUUID();
}

export function marketingDemoScanRateLimitKey(visitorId: string): string {
  return `marketing:demo-scan:${visitorId}`;
}
