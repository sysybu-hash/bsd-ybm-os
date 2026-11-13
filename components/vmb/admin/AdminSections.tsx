import type { AdminMetrics, AdminOffice, adminJobs, adminPayments } from "@/lib/vmb/admin-store";
import { RefundButton, type RefundLabels } from "@/components/vmb/admin/RefundButton";
import { OfficeActions, type OfficeActionsLabels } from "@/components/vmb/admin/OfficeActions";
import { VmbLink } from "@/components/vmb/VmbLink";

type T = (k: string, vars?: Record<string, string>) => string;

const n = (v: number) => v.toLocaleString("en-US");
const money = (minor: number) => `⁦₪${n(Math.round(minor / 100))}⁩`;
const duration = (sec: number, t: T) => (sec >= 120 ? t("minutes", { n: n(Math.round(sec / 60)) }) : t("seconds", { n: n(sec) }));
const day = (d: Date) => d.toLocaleDateString("he-IL", { day: "numeric", month: "short", year: "numeric" });

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="vmb-card p-5">
      <p className="text-xs text-[color:var(--vmb-muted)]">{label}</p>
      <p className="vmb-display mt-1 text-3xl font-extrabold">{value}</p>
      {note ? <p className="mt-1 text-xs text-[color:var(--vmb-ink-soft)]">{note}</p> : null}
    </div>
  );
}

/** The product's numbers (M4): offices, money, booklets, and the free-render share rule 13.9 watches. */
export function MetricsGrid({ m, t }: { m: AdminMetrics; t: T }) {
  const j = m.jobs30d;
  const live = (j.queued ?? 0) + (j.running ?? 0);
  const none = t("none");
  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile label={t("m_offices")} value={n(m.offices)} note={t("m_active", { n: n(m.activeSubscriptions) })} />
      <Tile label={t("m_rev30")} value={money(m.revenueMinor30d)} note={t("m_revAll", { v: money(m.revenueMinorAll) })} />
      <Tile label={t("m_jobs")} value={n(j.done ?? 0)} note={t("m_jobsLine", { failed: n(j.failed ?? 0), live: n(live), cancelled: n(j.cancelled ?? 0) })} />
      <Tile
        label={t("m_free")}
        value={m.freeRenderShare == null ? none : `${Math.round(m.freeRenderShare * 100)}%`}
        note={t("m_freeNote", { n: n(m.picturesDelivered30d) })}
      />
      <Tile label={t("m_credits")} value={m.creditsPerBooklet == null ? none : n(m.creditsPerBooklet)} />
      <Tile label={t("m_compute")} value={m.avgComputeSeconds == null ? none : duration(m.avgComputeSeconds, t)} />
    </section>
  );
}

function subText(s: AdminOffice["subscription"], t: T): { text: string; tone: string } {
  if (!s) return { text: t("sub_none"), tone: "text-[color:var(--vmb-muted)]" };
  if (s.status === "frozen") return { text: t("sub_frozen"), tone: "text-[color:var(--vmb-warn)]" };
  if (s.active) return { text: t("sub_active", { date: day(s.periodEnd) }), tone: "text-[color:var(--vmb-pass)]" };
  return { text: t("sub_expired", { date: day(s.periodEnd) }), tone: "text-[color:var(--vmb-muted)]" };
}

export function OfficesList({ offices, t, actions }: { offices: AdminOffice[]; t: T; actions: OfficeActionsLabels }) {
  return (
    <section className="vmb-card p-6">
      <h2 className="text-lg font-bold">{t("officesTitle")}</h2>
      {offices.length === 0 ? <p className="mt-3 text-sm text-[color:var(--vmb-muted)]">{t("empty")}</p> : null}
      <ul className="mt-3 divide-y divide-[color:var(--vmb-line)]">
        {offices.map((o) => {
          const s = subText(o.subscription, t);
          return (
            <li key={o.id} className="py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="font-semibold">
                  {o.name}
                  {o.owner ? (
                    <span className="vmb-mono ms-2 text-xs font-normal text-[color:var(--vmb-muted)]" dir="ltr">
                      {o.owner}
                    </span>
                  ) : null}
                </p>
                <p className={`text-xs ${s.tone}`}>{s.text}</p>
              </div>
              <p className="mt-1 text-xs text-[color:var(--vmb-ink-soft)]">
                {t("o_line", { members: n(o.members), projects: n(o.projects), balance: n(o.balance), date: day(o.createdAt) })}
              </p>
              <OfficeActions workspaceId={o.id} frozen={o.subscription?.status === "frozen"} labels={actions} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

type Job = Awaited<ReturnType<typeof adminJobs>>["live"][number];

function JobRows({ jobs, t }: { jobs: Job[]; t: T }) {
  if (!jobs.length) return <p className="mt-3 text-sm text-[color:var(--vmb-muted)]">{t("empty")}</p>;
  return (
    <ul className="mt-3 divide-y divide-[color:var(--vmb-line)] text-xs">
      {jobs.map((j) => (
        <li key={j.id} className="space-y-0.5 py-2.5">
          <p className="flex flex-wrap items-baseline justify-between gap-2">
            <VmbLink href={`/admin/job/${j.id}`} className="font-semibold underline-offset-2 hover:underline">
              {t("job_line", { office: j.workspace.name, project: j.project.name })}
            </VmbLink>
            <span className="text-[color:var(--vmb-ink-soft)]">
              {t(`status_${j.status}`)}
              {j.status === "running" ? ` · ${j.percent}%` : ""}
            </span>
          </p>
          <p className="text-[color:var(--vmb-muted)]">
            {day(j.createdAt)}
            {j.costCredits != null ? ` · ${t("held", { n: n(j.costCredits) })}` : ""}
            {j.computeMs != null ? ` · ${duration(Math.round(j.computeMs / 1000), t)}` : ""}
          </p>
          {j.error ? (
            <p className="vmb-mono break-all text-[color:var(--vmb-fail)]" dir="ltr">
              {j.error}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function JobsPanels({ jobs, t }: { jobs: Awaited<ReturnType<typeof adminJobs>>; t: T }) {
  return (
    <section className="grid gap-4 md:grid-cols-2">
      <div className="vmb-card p-6">
        <h2 className="text-lg font-bold">{t("jobsLive")}</h2>
        <JobRows jobs={jobs.live} t={t} />
      </div>
      <div className="vmb-card p-6">
        <h2 className="text-lg font-bold">{t("jobsFailed")}</h2>
        <JobRows jobs={jobs.failed.rows} t={t} />
      </div>
    </section>
  );
}

export function PaymentsList({ payments, t, refund }: { payments: Awaited<ReturnType<typeof adminPayments>>["rows"]; t: T; refund: RefundLabels }) {
  return (
    <section className="vmb-card p-6">
      <h2 className="text-lg font-bold">{t("paymentsTitle")}</h2>
      {payments.length === 0 ? <p className="mt-3 text-sm text-[color:var(--vmb-muted)]">{t("empty")}</p> : null}
      <ul className="mt-3 divide-y divide-[color:var(--vmb-line)] text-xs">
        {payments.map((p) => (
          <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
            <span>
              <span className="font-semibold">{p.workspace.name}</span>
              <span className="ms-2 text-[color:var(--vmb-ink-soft)]">
                {t(`kind_${p.kind}`)} · {t(`gateway_${p.gateway}`)}
                {p.status !== "completed" ? ` · ${t(`pay_${p.status}`)}` : ""}
              </span>
              <span className="ms-2 text-[color:var(--vmb-muted)]">{day(p.createdAt)}</span>
            </span>
            <span className="flex items-baseline gap-3">
              {p.status === "completed" ? <RefundButton workspaceId={p.workspaceId} paymentId={p.id} labels={refund} /> : null}
              <span className="vmb-mono">{money(p.amountMinor)}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
