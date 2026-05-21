import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { jsonBadRequest } from "@/lib/api-json";
import { prisma } from "@/lib/prisma";
import { getVapidPublicKey } from "@/lib/push/vapid-config";

export const dynamic = "force-dynamic";

export const GET = withWorkspacesAuth(async () => {
  return NextResponse.json({ publicKey: getVapidPublicKey() });
});

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
  userAgent: z.string().optional(),
});

export const POST = withWorkspacesAuth(async (req, { userId }) => {
  try {
    const body = subscribeSchema.parse(await req.json());
    await prisma.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      create: {
        userId,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent: body.userAgent,
      },
      update: {
        userId,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent: body.userAgent,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonBadRequest("מנוי push לא תקין", "invalid_subscription");
    }
    return apiErrorResponse(error, "push/subscribe POST");
  }
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

export const DELETE = withWorkspacesAuth(async (req, { userId }) => {
  try {
    const body = unsubscribeSchema.parse(await req.json());
    await prisma.pushSubscription.deleteMany({
      where: { endpoint: body.endpoint, userId },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, "push/subscribe DELETE");
  }
});
