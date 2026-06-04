/**
 * Public lead capture endpoint — marketing landing pages.
 *
 * Creates a Contact record (status=LEAD) for website visitors who submit
 * the "צור קשר / Get in touch" form. No auth required.
 * Rate-limited: 5 submissions per IP per hour to prevent spam.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonBadRequest } from "@/lib/api-json";
import { checkRateLimit } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";
import {
  FUNNEL_EVENTS,
  trackFunnelServer,
} from "@/lib/analytics/marketing-funnel-server";

export const dynamic = "force-dynamic";

const log = createLogger("leads");

const schema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email().max(200),
  phone: z.string().max(20).optional(),
  message: z.string().max(2000).optional(),
  source: z.string().max(50).optional().default("website"),
  locale: z.enum(["he", "en", "ru"]).optional().default("he"),
});

export async function POST(req: Request) {
  try {
    // Rate limit by IP (5 submissions per hour)
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rl = await checkRateLimit(`leads:ip:${ip}`, 5, 60 * 60 * 1000);
    if (!rl.success) {
      return NextResponse.json(
        { error: "יותר מדי בקשות. אנא המתן שעה ונסה שוב.", code: "rate_limited" },
        { status: 429 },
      );
    }

    const raw = (await req.json().catch(() => null)) as unknown;
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return jsonBadRequest("נתונים לא תקינים", "invalid_input");
    }

    const { name, email, phone, message, source, locale } = parsed.data;
    const normalized = email.toLowerCase().trim();

    // Check if contact already exists in any org (by email)
    const existing = await prisma.contact.findFirst({
      where: { email: { equals: normalized, mode: "insensitive" } },
      select: { id: true },
    });

    if (existing) {
      // Silently succeed — don't leak that the email exists
      return NextResponse.json({ ok: true, existing: true });
    }

    // Route the lead to the platform owner's organization (oldest org = platform owner).
    const platformOrg = await prisma.organization.findFirst({
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });

    if (!platformOrg) {
      log.warn("lead_capture_no_org_found", { email: normalized });
      // Still return success to the user
      return NextResponse.json({ ok: true });
    }

    await prisma.contact.create({
      data: {
        name: name.trim(),
        email: normalized,
        phone: phone?.trim() ?? null,
        notes: message?.trim() ?? null,
        status: "LEAD",
        tags: [`source:${source}`, `locale:${locale}`],
        organizationId: platformOrg.id,
      },
    });

    log.info("lead_captured", { source, locale });
    trackFunnelServer(normalized, FUNNEL_EVENTS.leadSubmitted, { source, locale });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("lead_capture_failed", { error: message });
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}
