import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { jsonBadRequest } from "@/lib/api-json";
import {
  GoogleCalendarService,
  GoogleOAuthNotLinkedError,
  GoogleOAuthRefreshError,
} from "@/lib/services/google-calendar";
import { prisma } from "@/lib/prisma";

const createEventSchema = z.object({
  summary: z.string().trim().min(1),
  description: z.string().trim().optional(),
  start: z.string().trim().min(1),
  end: z.string().trim().min(1),
});

export const GET = withWorkspacesAuth(async (_req, { userId, orgId }) => {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { calendarGoogleEnabled: true },
  });

  if (org?.calendarGoogleEnabled === false) {
    return NextResponse.json({
      connected: false,
      disabled: true,
      message: "יומן Google כבוי בהגדרות הארגון.",
    });
  }

  try {
    const cal = await GoogleCalendarService.forUser(userId);
    const events = await cal.listEvents();
    return NextResponse.json({ connected: true, events });
  } catch (e) {
    if (e instanceof GoogleOAuthNotLinkedError) {
      return NextResponse.json({
        connected: false,
        message: "חברו חשבון Google מההתחברות כדי לסנכרן יומן.",
      });
    }
    if (e instanceof GoogleOAuthRefreshError) {
      return NextResponse.json({
        connected: false,
        message: e.message,
      });
    }
    throw e;
  }
});

export const POST = withWorkspacesAuth(async (req, { userId, orgId }, data) => {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { calendarGoogleEnabled: true },
  });
  if (org?.calendarGoogleEnabled === false) {
    return jsonBadRequest("יומן Google כבוי בארגון.", "calendar_disabled");
  }

  const { summary, description, start, end } = data as z.infer<typeof createEventSchema>;

  try {
    const cal = await GoogleCalendarService.forUser(userId);
    const created = await cal.createEvent({ summary, description, start, end });
    return NextResponse.json({ ok: true, event: created });
  } catch (e) {
    if (e instanceof GoogleOAuthNotLinkedError) {
      return jsonBadRequest(e.message, "google_not_linked");
    }
    if (e instanceof GoogleOAuthRefreshError) {
      return jsonBadRequest(e.message, "google_refresh_failed");
    }
    throw e;
  }
}, { schema: createEventSchema });
