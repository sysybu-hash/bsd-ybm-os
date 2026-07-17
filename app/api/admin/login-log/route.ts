import { NextResponse } from "next/server";
import { AccountStatus } from "@prisma/client";
import { withOSAdmin } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import {
  PRESENCE_AWAY_MS,
  PRESENCE_ONLINE_MS,
  presenceStatusFromLastSeen,
} from "@/lib/admin/login-presence";

export const dynamic = "force-dynamic";

export const GET = withOSAdmin(async (req) => {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(200, Math.max(20, Number(searchParams.get("limit") || 80) || 80));
  const q = searchParams.get("q")?.trim().toLowerCase() || "";
  const now = Date.now();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const emailFilter = q
    ? {
        OR: [
          { email: { contains: q, mode: "insensitive" as const } },
          { name: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [users, events, loginsToday] = await Promise.all([
    prisma.user.findMany({
      where: {
        accountStatus: AccountStatus.ACTIVE,
        ...emailFilter,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        lastLoginAt: true,
        lastSeenAt: true,
        organizationId: true,
        organization: {
          select: {
            id: true,
            name: true,
            subscriptionStatus: true,
            subscriptionTier: true,
          },
        },
      },
      orderBy: [{ lastSeenAt: "desc" }, { lastLoginAt: "desc" }],
      take: 300,
    }),
    prisma.loginEvent.findMany({
      where: q
        ? {
            OR: [
              { email: { contains: q, mode: "insensitive" } },
              { user: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : undefined,
      select: {
        id: true,
        email: true,
        provider: true,
        ip: true,
        userAgent: true,
        createdAt: true,
        userId: true,
        organizationId: true,
        user: { select: { name: true } },
        organization: { select: { name: true, subscriptionStatus: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.loginEvent.count({
      where: { createdAt: { gte: startOfDay } },
    }),
  ]);

  const connections = users
    .map((u) => {
      const status = presenceStatusFromLastSeen(u.lastSeenAt, now);
      return {
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        lastSeenAt: u.lastSeenAt?.toISOString() ?? null,
        status,
        organization: u.organization
          ? {
              id: u.organization.id,
              name: u.organization.name,
              subscriptionStatus: u.organization.subscriptionStatus,
              subscriptionTier: u.organization.subscriptionTier,
            }
          : null,
      };
    })
    .sort((a, b) => {
      const rank = { online: 0, away: 1, offline: 2 } as const;
      const d = rank[a.status] - rank[b.status];
      if (d !== 0) return d;
      const at = a.lastSeenAt ? Date.parse(a.lastSeenAt) : 0;
      const bt = b.lastSeenAt ? Date.parse(b.lastSeenAt) : 0;
      return bt - at;
    });

  const summary = {
    online: connections.filter((c) => c.status === "online").length,
    away: connections.filter((c) => c.status === "away").length,
    offline: connections.filter((c) => c.status === "offline").length,
    loginsToday,
    activeUsers: connections.length,
  };

  return NextResponse.json({
    checkedAt: new Date(now).toISOString(),
    onlineThresholdMs: PRESENCE_ONLINE_MS,
    awayThresholdMs: PRESENCE_AWAY_MS,
    summary,
    connections,
    events: events.map((e) => ({
      id: e.id,
      email: e.email,
      name: e.user.name,
      provider: e.provider,
      ip: e.ip,
      userAgent: e.userAgent,
      createdAt: e.createdAt.toISOString(),
      userId: e.userId,
      organizationId: e.organizationId,
      organizationName: e.organization?.name ?? null,
      subscriptionStatus: e.organization?.subscriptionStatus ?? null,
    })),
  });
});
