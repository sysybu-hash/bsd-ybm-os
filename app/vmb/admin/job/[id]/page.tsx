import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { vmbT } from "@/lib/vmb/i18n";
import { isVmbSuperAdmin } from "@/lib/vmb/admin";
import { adminJob } from "@/lib/vmb/admin-store";
import { jobCost } from "@/lib/vmb/costs-store";
import { getVmbPageUser, vmbServerPath } from "@/lib/vmb/page-session";
import { VmbLink } from "@/components/vmb/VmbLink";
import { JobActions } from "@/components/vmb/admin/JobActions";

export const dynamic = "force-dynamic";

const t = vmbT("he");
const a = (k: string, vars?: Record<string, string>) => t(`vmb.admin.${k}`, vars);

export const metadata: Metadata = { title: t("vmb.admin.jobTitle"), robots: { index: false } };

const n = (v: number) => v.toLocaleString("en-US");
const money = (minor: number) => `⁦₪${(minor / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}⁩`;
const when = (d: Date | null) => (d ? d.toLocaleString("he-IL", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : a("none"));
const STAGES = ["read", "build", "render", "paint", "booklet"];
const ERRORS = ["not_found", "blocked", "bad_request", "forbidden", "failed"];

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 py-2">
      <dt className="text-[color:var(--vmb-muted)]">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

/** One job, for the administrator: how it went stage by stage, why it stopped, what it cost, and what to do with it. */
export default async function VmbAdminJobPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getVmbPageUser();
  if (!user) redirect(await vmbServerPath("/login"));
  if (!(await isVmbSuperAdmin(user))) notFound();
  const { id } = await params;
  const job = await adminJob(id);
  if (!job) notFound();
  const cost = await jobCost(job);
  const seconds = job.computeMs == null ? null : Math.round(job.computeMs / 1000);

  return (
    <div className="vmb min-h-screen" data-theme="dark" dir="rtl" lang="he">
      <main className="mx-auto max-w-4xl space-y-6 px-5 py-10">
        <VmbLink href="/admin" className="flex items-center gap-2 text-sm text-[color:var(--vmb-ink-soft)] hover:text-[color:var(--vmb-ink)]">
          <ArrowRight className="h-4 w-4 ltr:rotate-180" aria-hidden />
          {a("jobBack")}
        </VmbLink>
        <div>
          <p className="text-sm text-[color:var(--vmb-accent)]">{job.workspace.name}</p>
          <h1 className="vmb-display mt-2 text-3xl font-extrabold">{job.project.name}</h1>
          <p className="vmb-mono mt-1 text-xs text-[color:var(--vmb-muted)]" dir="ltr">
            {job.id}
          </p>
        </div>

        <section className="vmb-card p-6">
          <h2 className="text-lg font-bold">{a("jobState")}</h2>
          <dl className="mt-2 divide-y divide-[color:var(--vmb-line)] text-sm">
            <Row label={a("jobStatus")} value={`${a(`status_${job.status}`)}${job.status === "running" ? ` · ${job.percent}%` : ""}`} />
            <Row label={a("jobCreated")} value={when(job.createdAt)} />
            <Row label={a("jobStarted")} value={when(job.startedAt)} />
            <Row label={a("jobFinished")} value={when(job.finishedAt)} />
            <Row label={a("m_compute")} value={seconds == null ? a("none") : seconds >= 120 ? a("minutes", { n: n(Math.round(seconds / 60)) }) : a("seconds", { n: n(seconds) })} />
            <Row label={a("jobHeld")} value={job.costCredits == null ? a("none") : n(job.costCredits)} />
            <Row label={a("jobFiles")} value={n(job.project.files)} />
          </dl>
        </section>

        <section className="vmb-card p-6">
          <h2 className="text-lg font-bold">{a("jobStages")}</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {job.stages.map((s) => (
              <li key={s.key} className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold">{STAGES.includes(s.key) ? a(`stage_${s.key}`) : s.key}</span>
                <span className="vmb-mono text-xs text-[color:var(--vmb-ink-soft)]" dir="ltr">
                  {n(s.done)} / {n(s.total)}
                </span>
                {s.detail ? <span className="w-full text-xs text-[color:var(--vmb-muted)]">{s.detail}</span> : null}
              </li>
            ))}
          </ul>
        </section>

        {job.stop || job.error ? (
          <section className="vmb-card p-6">
            <h2 className="text-lg font-bold">{a("jobWhy")}</h2>
            {job.stop?.message ? <p className="mt-2 text-sm">{job.stop.message}</p> : null}
            {job.error ? (
              <p className="vmb-mono mt-2 text-xs break-all text-[color:var(--vmb-fail)]" dir="ltr">
                {job.error}
              </p>
            ) : null}
          </section>
        ) : null}

        {job.booklet ? (
          <section className="vmb-card p-6">
            <h2 className="text-lg font-bold">{a("jobBooklet")}</h2>
            <dl className="mt-2 divide-y divide-[color:var(--vmb-line)] text-sm">
              <Row label={a("jobRoute")} value={job.booklet.route} />
              <Row label={a("jobPainted")} value={n(job.booklet.picturesPainted)} />
              <Row label={a("jobFree")} value={n(job.booklet.picturesFree)} />
              <Row label={a("jobBilled")} value={n(job.booklet.creditsUsed)} />
            </dl>
            {job.booklet.assumptions.length ? (
              <ul className="mt-3 list-disc space-y-1 ps-5 text-xs text-[color:var(--vmb-ink-soft)]">
                {job.booklet.assumptions.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        <section className="vmb-card p-6">
          <h2 className="text-lg font-bold">{a("jobCost")}</h2>
          <p className="mt-1 text-xs text-[color:var(--vmb-muted)]">{a("jobCostLead")}</p>
          <ul className="mt-3 divide-y divide-[color:var(--vmb-line)] text-sm">
            {cost.lines.map((l) => (
              <li key={l.key} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span className="font-semibold">{a(`line_${l.key}`)}</span>
                {l.minor == null ? (
                  <span className="text-xs text-[color:var(--vmb-warn)]">{l.missing.map((m) => a("c_needRate", { rate: a(`rate_${m}`) })).join(" · ")}</span>
                ) : (
                  <span className="vmb-mono">{money(l.minor)}</span>
                )}
              </li>
            ))}
            <li className="flex items-baseline justify-between gap-2 py-2 font-bold">
              <span>{a("c_total")}</span>
              <span className="vmb-mono">{money(cost.totalMinor)}</span>
            </li>
          </ul>
          {cost.aiUnpricedCalls ? <p className="mt-2 text-xs text-[color:var(--vmb-warn)]">{a("c_unpriced", { n: n(cost.aiUnpricedCalls) })}</p> : null}
        </section>

        <section className="vmb-card p-6">
          <h2 className="text-lg font-bold">{a("act_open")}</h2>
          <p className="mt-1 mb-3 text-xs text-[color:var(--vmb-muted)]">{a("jobActionsLead")}</p>
          <JobActions
            workspaceId={job.workspaceId}
            projectId={job.project.id}
            canRetry={job.status === "failed" || job.status === "cancelled"}
            bench={job.bench}
            labels={{ retry: a("jobRetry"), benchOn: a("jobBenchOn"), benchOff: a("jobBenchOff"), done: a("act_done"), errors: Object.fromEntries(ERRORS.map((c) => [c, a(`err_${c}`)])) }}
          />
        </section>
      </main>
    </div>
  );
}
