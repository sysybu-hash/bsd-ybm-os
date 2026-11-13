import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, Search } from "lucide-react";
import { vmbT } from "@/lib/vmb/i18n";
import { isVmbSuperAdmin } from "@/lib/vmb/admin";
import { adminJobs, adminMetrics, adminOffices, adminPayments } from "@/lib/vmb/admin-store";
import { adminCosts, adminLog, systemState } from "@/lib/vmb/costs-store";
import { getVmbPageUser, vmbServerPath } from "@/lib/vmb/page-session";
import { VmbLink } from "@/components/vmb/VmbLink";
import { VmbWordmark } from "@/components/vmb/VmbWordmark";
import { AccountMenu } from "@/components/vmb/studio/AccountMenu";
import { JobsPanels, MetricsGrid, OfficesList, PaymentsList } from "@/components/vmb/admin/AdminSections";
import { CostLines, CostOffices, CostRatesPanel, CostsSummary, FixedCostsPanel } from "@/components/vmb/admin/CostsSections";
import { AdminTabs, LogPanel, Pager, SystemPanel } from "@/components/vmb/admin/LogSections";
import type { OfficeActionsLabels } from "@/components/vmb/admin/OfficeActions";

export const dynamic = "force-dynamic";

const t = vmbT("he");
const a = (k: string, vars?: Record<string, string>) => t(`vmb.admin.${k}`, vars);

export const metadata: Metadata = { title: t("vmb.admin.title"), robots: { index: false } };

const ERROR_CODES = ["not_found", "no_subscription", "below_zero", "duplicate", "not_frozen", "not_active", "already_refunded", "bad_request", "forbidden", "failed"];
const TABS = ["overview", "costs", "log"] as const;
type Tab = (typeof TABS)[number];

function actionLabels(): OfficeActionsLabels {
  return {
    open: a("act_open"),
    grant: a("act_grant"),
    amount: a("act_amount"),
    note: a("act_note"),
    activate: a("act_activate"),
    reference: a("act_reference"),
    extend: a("act_extend"),
    days: a("act_days"),
    freeze: a("act_freeze"),
    unfreeze: a("act_unfreeze"),
    submit: a("act_submit"),
    done: a("act_done"),
    errors: Object.fromEntries(ERROR_CODES.map((c) => [c, a(`err_${c}`)])),
  };
}

type Pages = { q?: string; op?: string; jp?: string; pp?: string };
const pageNo = (v?: string) => (v && /^\d{1,4}$/.test(v) ? Number(v) : 0);

async function Overview({ query }: { query: Pages }) {
  const [metrics, offices, jobs, payments] = await Promise.all([adminMetrics(), adminOffices(query.q, pageNo(query.op)), adminJobs(pageNo(query.jp)), adminPayments(pageNo(query.pp))]);
  const labels = { prev: a("pagePrev"), next: a("pageNext") };
  return (
    <>
      <MetricsGrid m={metrics} t={a} />
      <JobsPanels jobs={jobs} t={a} />
      <Pager page={jobs.failed.page} more={jobs.failed.more} param="jp" query={query} labels={labels} />
      <OfficesList offices={offices.rows} t={a} actions={actionLabels()} />
      <Pager page={offices.page} more={offices.more} param="op" query={query} labels={labels} />
      <PaymentsList
        payments={payments.rows}
        t={a}
        refund={{ open: a("act_refund"), note: a("act_refund_note"), submit: a("act_refund_submit"), confirm: a("act_refund_confirm"), errors: Object.fromEntries(ERROR_CODES.map((c) => [c, a(`err_${c}`)])) }}
      />
      <Pager page={payments.page} more={payments.more} param="pp" query={query} labels={labels} />
    </>
  );
}

/** The month's costs: what was measured, the rates that price it, and the fixed costs the owner entered. */
async function Costs({ month }: { month?: string }) {
  const c = await adminCosts(month);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <form className="flex items-center gap-2" method="get">
        <input type="hidden" name="tab" value="costs" />
        <label htmlFor="costs-month" className="text-sm text-[color:var(--vmb-ink-soft)]">
          {a("c_month")}
        </label>
        <input
          id="costs-month"
          type="month"
          name="month"
          defaultValue={c.month}
          className="vmb-mono rounded-full border border-[color:var(--vmb-line)] bg-[color:var(--vmb-bg-sunk)] px-4 py-1.5 text-sm"
          dir="ltr"
        />
        <button type="submit" className="rounded-full border border-[color:var(--vmb-line-strong)] px-4 py-1.5 text-sm font-semibold">
          {a("c_show")}
        </button>
      </form>
      <CostsSummary c={c} t={a} />
      <div className="grid gap-4 lg:grid-cols-2">
        <CostLines c={c} t={a} />
        <CostOffices c={c} t={a} />
      </div>
      <FixedCostsPanel c={c} t={a} today={today} />
      <CostRatesPanel c={c} t={a} />
    </>
  );
}

async function Log() {
  const rows = await adminLog();
  return (
    <>
      <SystemPanel state={systemState()} t={a} />
      <LogPanel rows={rows} t={a} />
    </>
  );
}

/** VMB's own administration: numbers and offices, the month's costs, and the administrators' log. Not an admin → 404. */
export default async function VmbAdminPage({ searchParams }: { searchParams: Promise<Pages & { tab?: string; month?: string }> }) {
  const user = await getVmbPageUser();
  if (!user) redirect(await vmbServerPath("/login"));
  if (!(await isVmbSuperAdmin(user))) notFound();
  const { tab: rawTab, month, ...query } = await searchParams;
  const { q } = query;
  const tab: Tab = (TABS as readonly string[]).includes(rawTab ?? "") ? (rawTab as Tab) : "overview";

  return (
    <div className="vmb min-h-screen" data-theme="dark" dir="rtl" lang="he">
      <header className="border-b border-[color:var(--vmb-line)]">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
          <VmbLink href="/app" className="flex items-center gap-2 text-sm text-[color:var(--vmb-ink-soft)] hover:text-[color:var(--vmb-ink)]">
            <ArrowRight className="h-4 w-4 ltr:rotate-180" aria-hidden />
            {a("back")}
          </VmbLink>
          <VmbWordmark className="h-9 w-auto" />
          <AccountMenu name={user.name ?? user.email} image={user.image} logoutLabel={t("vmb.studio.logout")} />
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-5 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-[color:var(--vmb-accent)]">{a("kicker")}</p>
            <h1 className="vmb-display mt-2 text-4xl font-extrabold">{a("title")}</h1>
          </div>
          {tab === "overview" ? (
            <form className="flex w-full max-w-sm items-center gap-2" role="search" method="get">
              <input
                name="q"
                defaultValue={q ?? ""}
                aria-label={a("search")}
                placeholder={a("search")}
                className="min-w-0 flex-1 rounded-full border border-[color:var(--vmb-line)] bg-[color:var(--vmb-bg-sunk)] px-4 py-2 text-sm"
              />
              <button type="submit" aria-label={a("searchBtn")} className="grid h-9 w-9 place-items-center rounded-full bg-[color:var(--vmb-accent)] text-[color:var(--vmb-accent-ink)]">
                <Search className="h-4 w-4" aria-hidden />
              </button>
            </form>
          ) : null}
        </div>

        <AdminTabs current={tab} labels={{ overview: a("tab_overview"), costs: a("tab_costs"), log: a("tab_log") }} />
        {tab === "costs" ? <Costs month={month} /> : tab === "log" ? <Log /> : <Overview query={query} />}
      </main>
    </div>
  );
}
