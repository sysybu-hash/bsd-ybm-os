import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { groupAiUsage } from "@/lib/ai-usage-store";
import { fetchFrankfurterRates } from "@/lib/exchange-rates/frankfurter";
import { monthRange } from "@/lib/projects/floorplan-viz-costs";
import { COST_RATE_KEYS, costReport, engineWorkspace, type CostRateKey, type CostRates, type CostReport, type FixedCost } from "@/lib/vmb/costs";

/**
 * The cost console's data (admin): what the month cost, the rates and fixed costs behind it, the administrators' log
 * and the system's state. Every caller has already checked isVmbSuperAdmin.
 */

const log = createLogger("vmb-costs");

const asObject = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** One administrator action, kept. A log that cannot be written never fails the action it records. */
export async function logAdminAction(entry: { adminEmail: string; action: string; workspaceId?: string | null; ok?: boolean; detail?: Record<string, unknown> }): Promise<void> {
  try {
    await prisma.vmbAdminLog.create({
      data: { adminEmail: entry.adminEmail, action: entry.action, workspaceId: entry.workspaceId ?? null, ok: entry.ok ?? true, detail: (entry.detail ?? {}) as Prisma.InputJsonValue },
    });
  } catch (err: unknown) {
    log.warn("admin log not written", { action: entry.action, error: err instanceof Error ? err.message : String(err) });
  }
}

export async function adminLog(take = 50) {
  return prisma.vmbAdminLog.findMany({ orderBy: { createdAt: "desc" }, take, select: { id: true, createdAt: true, adminEmail: true, action: true, workspaceId: true, ok: true, detail: true } });
}

export async function costRates(): Promise<CostRates> {
  const rows = await prisma.vmbCostRate.findMany({ select: { key: true, value: true } });
  const out: CostRates = {};
  for (const r of rows) if ((COST_RATE_KEYS as readonly string[]).includes(r.key)) out[r.key as CostRateKey] = r.value;
  return out;
}

async function usdToIls(): Promise<{ usdToIls: number; date: string } | null> {
  try {
    const rates = await fetchFrankfurterRates("USD", ["ILS"]);
    const ils = rates.rates.ILS;
    return typeof ils === "number" && ils > 0 ? { usdToIls: ils, date: rates.date } : null;
  } catch (err: unknown) {
    // No rate, no shekel figure: the report says the rate is missing.
    log.warn("USD/ILS rate unavailable", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

export type AdminCosts = {
  month: string;
  report: CostReport;
  rates: CostRates;
  rate: { usdToIls: number; date: string } | null;
  fixed: FixedCost[];
  officeNames: Record<string, string>;
  /** Engine calls recorded outside production (local runs, previews): counted, not costed. */
  otherEnvCalls: number;
};

export async function adminCosts(month: string | null | undefined): Promise<AdminCosts> {
  const range = monthRange(month);
  return { month: range.month, ...(await costsInRange(range)) };
}

/** Yesterday's running costs (no fixed costs, no storage): what the daily alert compares with the ceiling. */
export async function dayCosts(now = new Date()): Promise<{ day: string; totalMinor: number; ceilingMinor: number | null; partial: boolean }> {
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const from = new Date(to.getTime() - 86_400_000);
  const c = await costsInRange({ from, to }, { running: true });
  const ceiling = c.rates.dailyCeilingIls;
  return { day: from.toISOString().slice(0, 10), totalMinor: c.report.totalMinor, ceilingMinor: ceiling == null ? null : Math.round(ceiling * 100), partial: c.report.missing.length > 0 };
}

/**
 * What one job cost: its conversions and compute at the rates, and the model calls recorded for its office while it ran
 * (the usage log names the office, not the job, so two jobs of one office running at once share their calls).
 */
export async function jobCost(job: { workspaceId: string; startedAt: Date | null; finishedAt: Date | null; computeMs: number | null; dwgConversions: number }) {
  const range = { from: job.startedAt ?? new Date(0), to: job.finishedAt ?? new Date() };
  const [usage, rates, rate] = await Promise.all([job.startedAt ? groupAiUsage(range) : Promise.resolve(null), costRates(), usdToIls()]);
  const ai = (usage?.rows ?? []).filter((r) => engineWorkspace(r.feature) === job.workspaceId);
  const report = costReport({
    range,
    ai,
    jobs: [{ workspaceId: job.workspaceId, computeMs: job.computeMs, dwgConversions: job.dwgConversions, delivered: false, picturesPainted: 0 }],
    storageBytes: 0,
    payments: [],
    fixed: [],
    rates,
    usdToIls: rate?.usdToIls ?? null,
  });
  return { lines: report.lines.filter((l) => l.key === "ai" || l.key === "dwg" || l.key === "compute"), totalMinor: report.totalMinor, aiUnpricedCalls: report.aiUnpricedCalls };
}

async function costsInRange(range: { from: Date; to: Date }, opts: { running?: boolean } = {}): Promise<Omit<AdminCosts, "month">> {
  const [usage, jobs, storage, payments, fixed, rates, rate] = await Promise.all([
    groupAiUsage(range),
    prisma.vmbJob.findMany({
      where: { kind: "booklet", createdAt: { gte: range.from, lt: range.to } },
      select: { workspaceId: true, computeMs: true, dwgConversions: true, status: true, project: { select: { manifest: true } } },
      take: 5000,
    }),
    opts.running ? Promise.resolve({ _sum: { size: 0 } }) : prisma.vmbProjectFile.aggregate({ _sum: { size: true } }),
    prisma.vmbPayment.findMany({ where: { status: "completed", createdAt: { gte: range.from, lt: range.to } }, select: { workspaceId: true, gateway: true, amountMinor: true } }),
    opts.running ? Promise.resolve([]) : prisma.vmbFixedCost.findMany({ orderBy: { startsOn: "asc" }, select: { id: true, vendor: true, amountMinor: true, currency: true, startsOn: true, endsOn: true } }),
    costRates(),
    usdToIls(),
  ]);
  const engine = usage.rows.filter((r) => engineWorkspace(r.feature) != null);
  const ai = engine.filter((r) => r.environment === "production");
  const report = costReport({
    range,
    ai,
    jobs: jobs.map((j) => ({
      workspaceId: j.workspaceId,
      computeMs: j.computeMs,
      dwgConversions: j.dwgConversions,
      delivered: j.status === "done",
      picturesPainted: j.status === "done" ? num(asObject(asObject(j.project.manifest).booklet).picturesPainted) : 0,
    })),
    storageBytes: storage._sum.size ?? 0,
    payments,
    fixed,
    rates,
    usdToIls: rate?.usdToIls ?? null,
  });
  const ids = report.offices.map((o) => o.workspaceId);
  const names = ids.length ? await prisma.vmbWorkspace.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  return {
    report,
    rates,
    rate,
    fixed,
    officeNames: Object.fromEntries(names.map((n) => [n.id, n.name])),
    otherEnvCalls: engine.filter((r) => r.environment !== "production").reduce((a, r) => a + r.calls, 0),
  };
}

export type CostAction =
  | { action: "rate_set"; key: CostRateKey; value: number }
  | { action: "rate_clear"; key: CostRateKey }
  | { action: "fixed_add"; vendor: string; amount: number; currency: "ILS" | "USD"; startsOn: string; note?: string }
  | { action: "fixed_end"; id: string; endsOn: string }
  | { action: "fixed_delete"; id: string };

export type CostActionResult = { ok: true } | { ok: false; code: "not_found" | "bad_request" };

const dayStart = (iso: string): Date | null => {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** One change to the cost console's settings, logged with who made it. */
export async function runCostAction(adminEmail: string, a: CostAction): Promise<CostActionResult> {
  const result = await act(adminEmail, a);
  await logAdminAction({ adminEmail, action: a.action, ok: result.ok, detail: { ...a } });
  return result;
}

async function act(adminEmail: string, a: CostAction): Promise<CostActionResult> {
  switch (a.action) {
    case "rate_set":
      await prisma.vmbCostRate.upsert({ where: { key: a.key }, create: { key: a.key, value: a.value, updatedBy: adminEmail }, update: { value: a.value, updatedBy: adminEmail } });
      return { ok: true };
    case "rate_clear":
      await prisma.vmbCostRate.deleteMany({ where: { key: a.key } });
      return { ok: true };
    case "fixed_add": {
      const startsOn = dayStart(a.startsOn);
      if (!startsOn) return { ok: false, code: "bad_request" };
      await prisma.vmbFixedCost.create({ data: { vendor: a.vendor, amountMinor: Math.round(a.amount * 100), currency: a.currency, startsOn, note: a.note?.trim() || null } });
      return { ok: true };
    }
    case "fixed_end": {
      const endsOn = dayStart(a.endsOn);
      if (!endsOn) return { ok: false, code: "bad_request" };
      const r = await prisma.vmbFixedCost.updateMany({ where: { id: a.id }, data: { endsOn } });
      return r.count ? { ok: true } : { ok: false, code: "not_found" };
    }
    case "fixed_delete": {
      const r = await prisma.vmbFixedCost.deleteMany({ where: { id: a.id } });
      return r.count ? { ok: true } : { ok: false, code: "not_found" };
    }
  }
}

export type SystemState = { key: string; on: boolean }[];

/** Which parts of the platform are configured, by name only: no value ever leaves the server. */
export function systemState(): SystemState {
  return [
    { key: "runner", on: env.VMB_RUNNER_READY === "1" },
    { key: "queue", on: Boolean(env.QSTASH_TOKEN) },
    { key: "dwg", on: Boolean(env.CLOUDCONVERT_API_KEY) },
    { key: "privateStore", on: Boolean(env.VMB_BLOB_READ_WRITE_TOKEN) },
    { key: "paint", on: Boolean(env.GEMINI_API_KEY || env.GOOGLE_GENERATIVE_AI_API_KEY) },
    { key: "judge", on: Boolean(env.ANTHROPIC_API_KEY) },
    { key: "mail", on: Boolean(env.RESEND_API_KEY || env.SMTP_HOST) },
    { key: "google", on: Boolean(env.VMB_GOOGLE_CLIENT_ID && env.VMB_GOOGLE_CLIENT_SECRET) },
  ];
}
