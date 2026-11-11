import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { applyVmbPayment } from "@/lib/vmb/billing";
import { creditBalance, recordCredit } from "@/lib/vmb/credits";
import { isSubscriptionActive } from "@/lib/vmb/entitlement";
import { VMB_ANNUAL_PLAN, withVat } from "@/lib/vmb/plans";

/**
 * The VMB administration console's data (M4): offices, live and failed jobs, payments and the product's numbers, plus the
 * few actions an administrator takes by hand. Every caller has already checked isVmbSuperAdmin.
 */

const log = createLogger("vmb-admin");
const DAY = 86_400_000;

export type AdminMetrics = {
  offices: number;
  activeSubscriptions: number;
  revenueMinor30d: number;
  revenueMinorAll: number;
  jobs30d: Record<string, number>;
  /** Share of delivered pictures that went out as the free render (13.9); null before any booklet was delivered. */
  freeRenderShare: number | null;
  picturesDelivered30d: number;
  /** Credits billed per delivered booklet, on average. */
  creditsPerBooklet: number | null;
  avgComputeSeconds: number | null;
};

const asObject = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Pure: the numbers from the done jobs' booklets (manifest.booklet written by the runner). */
export function bookletNumbers(rows: Array<{ computeMs: number | null; manifest: unknown }>) {
  let painted = 0;
  let free = 0;
  let credits = 0;
  let booklets = 0;
  let ms = 0;
  let timed = 0;
  for (const r of rows) {
    const b = asObject(asObject(r.manifest).booklet);
    if (!Object.keys(b).length) continue;
    booklets++;
    painted += num(b.picturesPainted);
    free += num(b.picturesFree);
    credits += num(b.creditsUsed);
    if (r.computeMs != null) {
      ms += r.computeMs;
      timed++;
    }
  }
  const delivered = painted + free;
  return {
    picturesDelivered: delivered,
    freeRenderShare: delivered ? free / delivered : null,
    creditsPerBooklet: booklets ? Math.round(credits / booklets) : null,
    avgComputeSeconds: timed ? Math.round(ms / timed / 1000) : null,
  };
}

export async function adminMetrics(now = new Date()): Promise<AdminMetrics> {
  const since = new Date(now.getTime() - 30 * DAY);
  const [offices, subs, rev30, revAll, byStatus, done] = await Promise.all([
    prisma.vmbWorkspace.count(),
    prisma.vmbSubscription.findMany({ where: { status: "active", periodEnd: { gt: now } }, select: { status: true, periodEnd: true } }),
    prisma.vmbPayment.aggregate({ where: { status: "completed", createdAt: { gte: since } }, _sum: { amountMinor: true } }),
    prisma.vmbPayment.aggregate({ where: { status: "completed" }, _sum: { amountMinor: true } }),
    prisma.vmbJob.groupBy({ by: ["status"], where: { kind: "booklet", createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.vmbJob.findMany({
      where: { kind: "booklet", status: "done", finishedAt: { gte: since } },
      select: { computeMs: true, project: { select: { manifest: true } } },
      take: 1000,
    }),
  ]);
  const n = bookletNumbers(done.map((j) => ({ computeMs: j.computeMs, manifest: j.project.manifest })));
  return {
    offices,
    activeSubscriptions: subs.filter((s) => isSubscriptionActive(s, now)).length,
    revenueMinor30d: rev30._sum.amountMinor ?? 0,
    revenueMinorAll: revAll._sum.amountMinor ?? 0,
    jobs30d: Object.fromEntries(byStatus.map((g) => [g.status, g._count._all])),
    freeRenderShare: n.freeRenderShare,
    picturesDelivered30d: n.picturesDelivered,
    creditsPerBooklet: n.creditsPerBooklet,
    avgComputeSeconds: n.avgComputeSeconds,
  };
}

export type AdminOffice = {
  id: string;
  name: string;
  createdAt: Date;
  owner: string | null;
  members: number;
  projects: number;
  balance: number;
  subscription: { status: string; periodEnd: Date; active: boolean } | null;
};

/** Offices, newest first; `q` matches the office name or a member's address. */
export async function adminOffices(q?: string, now = new Date()): Promise<AdminOffice[]> {
  const term = q?.trim();
  const rows = await prisma.vmbWorkspace.findMany({
    where: term
      ? { OR: [{ name: { contains: term, mode: "insensitive" } }, { members: { some: { user: { email: { contains: term.toLowerCase() } } } } }] }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      name: true,
      createdAt: true,
      subscription: { select: { status: true, periodEnd: true } },
      members: { select: { role: true, user: { select: { email: true } } } },
      _count: { select: { projects: true } },
    },
  });
  const sums = rows.length
    ? await prisma.vmbCreditLedger.groupBy({ by: ["workspaceId"], where: { workspaceId: { in: rows.map((r) => r.id) } }, _sum: { delta: true } })
    : [];
  const balance = new Map(sums.map((s) => [s.workspaceId, s._sum.delta ?? 0]));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    createdAt: r.createdAt,
    owner: r.members.find((m) => m.role === "owner")?.user.email ?? r.members[0]?.user.email ?? null,
    members: r.members.length,
    projects: r._count.projects,
    balance: balance.get(r.id) ?? 0,
    subscription: r.subscription ? { ...r.subscription, active: isSubscriptionActive(r.subscription, now) } : null,
  }));
}

/** Jobs that need eyes: everything live, and the latest failures. */
export async function adminJobs() {
  const select = {
    id: true,
    kind: true,
    status: true,
    percent: true,
    error: true,
    createdAt: true,
    startedAt: true,
    finishedAt: true,
    computeMs: true,
    costCredits: true,
    workspace: { select: { name: true } },
    project: { select: { id: true, name: true, kind: true } },
  } as const;
  const [live, failed] = await Promise.all([
    prisma.vmbJob.findMany({ where: { status: { in: ["queued", "running"] } }, orderBy: { createdAt: "asc" }, take: 50, select }),
    prisma.vmbJob.findMany({ where: { status: "failed" }, orderBy: { finishedAt: "desc" }, take: 30, select }),
  ]);
  return { live, failed };
}

export async function adminPayments() {
  return prisma.vmbPayment.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, createdAt: true, gateway: true, txId: true, kind: true, packId: true, amountMinor: true, status: true, workspace: { select: { name: true } } },
  });
}

export type AdminAction =
  | { action: "grant"; workspaceId: string; amount: number; note: string }
  | { action: "activate"; workspaceId: string; reference: string }
  | { action: "freeze"; workspaceId: string }
  | { action: "unfreeze"; workspaceId: string }
  | { action: "extend"; workspaceId: string; days: number };

export type AdminActionResult = { ok: true } | { ok: false; code: "not_found" | "no_subscription" | "below_zero" | "duplicate" | "not_frozen" | "not_active" };

/** One administrator action. Every one is logged with who did it. */
export async function runAdminAction(adminEmail: string, a: AdminAction): Promise<AdminActionResult> {
  const ws = await prisma.vmbWorkspace.findUnique({ where: { id: a.workspaceId }, select: { id: true } });
  if (!ws) return { ok: false, code: "not_found" };
  const result = await act(adminEmail, a);
  log.info("vmb_admin_action", { action: a.action, workspaceId: a.workspaceId, admin: adminEmail, ok: result.ok, code: result.ok ? null : result.code });
  return result;
}

async function act(adminEmail: string, a: AdminAction): Promise<AdminActionResult> {
  switch (a.action) {
    case "grant": {
      if (a.amount < 0 && (await creditBalance(a.workspaceId)) + a.amount < 0) return { ok: false, code: "below_zero" };
      await recordCredit({ workspaceId: a.workspaceId, delta: a.amount, reason: "adjust", refId: `admin:${randomUUID()}`, note: `${a.note} (${adminEmail})` });
      return { ok: true };
    }
    case "activate": {
      // A bank transfer: the reference is the payment's id, so the same transfer cannot be applied twice.
      const r = await applyVmbPayment({
        purchase: { kind: "annual", workspaceId: a.workspaceId },
        gateway: "manual",
        txId: a.reference,
        amountMinor: withVat(VMB_ANNUAL_PLAN.priceMinor),
        currency: "ILS",
        trustAmount: true,
      });
      return r.applied ? { ok: true } : { ok: false, code: r.reason === "duplicate" ? "duplicate" : "not_found" };
    }
    case "freeze": {
      const r = await prisma.vmbSubscription.updateMany({ where: { workspaceId: a.workspaceId, status: "active" }, data: { status: "frozen" } });
      return r.count ? { ok: true } : { ok: false, code: "not_active" };
    }
    case "unfreeze": {
      const r = await prisma.vmbSubscription.updateMany({ where: { workspaceId: a.workspaceId, status: "frozen" }, data: { status: "active" } });
      return r.count ? { ok: true } : { ok: false, code: "not_frozen" };
    }
    case "extend": {
      const sub = await prisma.vmbSubscription.findUnique({ where: { workspaceId: a.workspaceId }, select: { periodEnd: true } });
      if (!sub) return { ok: false, code: "no_subscription" };
      const from = Math.max(sub.periodEnd.getTime(), Date.now());
      await prisma.vmbSubscription.update({ where: { workspaceId: a.workspaceId }, data: { periodEnd: new Date(from + a.days * DAY) } });
      return { ok: true };
    }
  }
}
