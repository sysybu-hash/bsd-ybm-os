import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, Search } from "lucide-react";
import { vmbT } from "@/lib/vmb/i18n";
import { isVmbSuperAdmin } from "@/lib/vmb/admin";
import { adminJobs, adminMetrics, adminOffices, adminPayments } from "@/lib/vmb/admin-store";
import { getVmbPageUser, vmbServerPath } from "@/lib/vmb/page-session";
import { VmbLink } from "@/components/vmb/VmbLink";
import { VmbWordmark } from "@/components/vmb/VmbWordmark";
import { AccountMenu } from "@/components/vmb/studio/AccountMenu";
import { JobsPanels, MetricsGrid, OfficesList, PaymentsList } from "@/components/vmb/admin/AdminSections";
import type { OfficeActionsLabels } from "@/components/vmb/admin/OfficeActions";

export const dynamic = "force-dynamic";

const t = vmbT("he");
const a = (k: string, vars?: Record<string, string>) => t(`vmb.admin.${k}`, vars);

export const metadata: Metadata = { title: t("vmb.admin.title"), robots: { index: false } };

const ERROR_CODES = ["not_found", "no_subscription", "below_zero", "duplicate", "not_frozen", "not_active", "bad_request", "forbidden", "failed"];

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

/** VMB's own administration (M4): numbers, offices with hand actions, live and failed jobs, payments. Not an admin → 404. */
export default async function VmbAdminPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await getVmbPageUser();
  if (!user) redirect(await vmbServerPath("/login"));
  if (!(await isVmbSuperAdmin(user))) notFound();
  const { q } = await searchParams;
  const [metrics, offices, jobs, payments] = await Promise.all([adminMetrics(), adminOffices(q), adminJobs(), adminPayments()]);

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
          <form className="flex w-full max-w-sm items-center gap-2" role="search">
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
        </div>

        <MetricsGrid m={metrics} t={a} />
        <JobsPanels jobs={jobs} t={a} />
        <OfficesList offices={offices} t={a} actions={actionLabels()} />
        <PaymentsList payments={payments} t={a} />
      </main>
    </div>
  );
}
