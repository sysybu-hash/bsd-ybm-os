import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ArrowRight, Coins } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { SITE_CONTACT } from "@/lib/site-contact";
import { isPayPalServerConfigured } from "@/lib/paypal-server";
import { vmbT } from "@/lib/vmb/i18n";
import { getVmbPageUser, vmbServerPath } from "@/lib/vmb/page-session";
import { ensureWorkspace } from "@/lib/vmb/workspace";
import { getEntitlement } from "@/lib/vmb/entitlement";
import { VMB_ANNUAL_PLAN, VMB_CREDIT_PACKS, withVat } from "@/lib/vmb/plans";
import { VmbLink } from "@/components/vmb/VmbLink";
import { VmbWordmark } from "@/components/vmb/VmbWordmark";
import { AccountMenu } from "@/components/vmb/studio/AccountMenu";
import { VmbPayPalButton } from "@/components/vmb/account/VmbPayPalButton";
import { RetentionPicker } from "@/components/vmb/account/RetentionPicker";
import { MembersCard } from "@/components/vmb/account/MembersCard";
import { creditsByProject, officeMembers } from "@/lib/vmb/members";

export const dynamic = "force-dynamic";

const t = vmbT("he");
const a = (k: string, vars?: Record<string, string>) => t(`vmb.account.${k}`, vars);

export const metadata: Metadata = { title: t("vmb.account.title"), robots: { index: false } };

const money = (minor: number) => `₪${(minor / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const day = (d: Date) => d.toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" });

/** Subscription, balance, purchases and the full credit history of the user's office. */
export default async function VmbAccountPage() {
  const user = await getVmbPageUser();
  if (!user) redirect(await vmbServerPath("/login"));
  const ws = await ensureWorkspace(user);
  const [ent, ledger, payments, policy, people, usage] = await Promise.all([
    getEntitlement(ws.id),
    prisma.vmbCreditLedger.findMany({
      where: { workspaceId: ws.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, createdAt: true, delta: true, reason: true },
    }),
    prisma.vmbPayment.findMany({
      where: { workspaceId: ws.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, createdAt: true, kind: true, packId: true, amountMinor: true },
    }),
    prisma.vmbWorkspace.findUnique({ where: { id: ws.id }, select: { fileRetentionDays: true } }),
    officeMembers(ws.id),
    creditsByProject(ws.id),
  ]);
  const memberErrors = Object.fromEntries(["not_owner", "already_member", "has_office", "not_found", "self", "bad_request", "failed"].map((c) => [c, a(`m_err_${c}`)]));
  const paypalOn = isPayPalServerConfigured();
  const status = ent.active
    ? a("statusActive", { date: day(ent.subscription!.periodEnd) })
    : ent.subscription?.status === "frozen"
      ? a("statusFrozen")
      : ent.subscription?.status === "active"
        ? a("statusExpired", { date: day(ent.subscription.periodEnd) })
        : a("statusNone");
  const payLabels = { okText: a("payOk"), failText: a("payFail") };

  return (
    <div className="vmb min-h-screen" data-theme="dark" dir="rtl" lang="he">
      <header className="border-b border-[color:var(--vmb-line)]">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-5">
          <VmbLink href="/app" className="flex items-center gap-2 text-sm text-[color:var(--vmb-ink-soft)] hover:text-[color:var(--vmb-ink)]">
            <ArrowRight className="h-4 w-4 ltr:rotate-180" aria-hidden />
            {a("back")}
          </VmbLink>
          <VmbWordmark className="h-9 w-auto" />
          <AccountMenu name={user.name ?? user.email} image={user.image} logoutLabel={t("vmb.studio.logout")} />
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-5 py-12">
        <div>
          <p className="text-sm text-[color:var(--vmb-accent)]">
            {a("office")} · {ws.name}
          </p>
          <h1 className="vmb-display mt-2 text-4xl font-extrabold sm:text-5xl">{a("title")}</h1>
        </div>

        <section className="grid gap-4 md:grid-cols-[1.3fr_1fr]">
          <div className="vmb-card relative overflow-hidden p-7">
            <div className="pointer-events-none absolute -top-24 -left-24 h-64 w-64 rounded-full bg-[color:var(--vmb-accent)]/20 blur-[80px]" />
            <p className="text-sm text-[color:var(--vmb-muted)]">{a("plan")}</p>
            <p className={`mt-2 text-2xl font-bold ${ent.active ? "text-[color:var(--vmb-pass)]" : ""}`}>{status}</p>
            <p className="mt-1 text-sm text-[color:var(--vmb-ink-soft)]">{a("included", { n: VMB_ANNUAL_PLAN.includedCredits.toLocaleString("en-US") })}</p>
            <div className="mt-7 border-t border-[color:var(--vmb-line)] pt-6">
              <p className="flex items-baseline justify-between gap-3">
                <span className="font-medium">{ent.active ? a("renew") : a("buyAnnual")}</span>
                <span className="text-sm text-[color:var(--vmb-muted)]">
                  <span className="vmb-display text-2xl font-extrabold text-[color:var(--vmb-ink)]">{money(withVat(VMB_ANNUAL_PLAN.priceMinor))}</span> {a("vatIncl")}
                </span>
              </p>
              {ent.active ? <p className="mt-1 text-xs text-[color:var(--vmb-muted)]">{a("renewNote")}</p> : null}
              <div className="mt-4">{paypalOn ? <VmbPayPalButton purchase={{ kind: "annual" }} {...payLabels} /> : null}</div>
            </div>
          </div>
          <div className="vmb-card flex flex-col justify-between p-7">
            <div>
              <p className="flex items-center gap-2 text-sm text-[color:var(--vmb-muted)]">
                <Coins className="h-4 w-4 text-[color:var(--vmb-accent)]" aria-hidden />
                {a("balance")}
              </p>
              <p className="vmb-display mt-2 text-6xl font-extrabold">{ent.balance.toLocaleString("en-US")}</p>
            </div>
            {!paypalOn ? (
              <p className="mt-6 text-sm text-[color:var(--vmb-warn)]">
                {a("paypalOff")}{" "}
                <a className="underline" href={`mailto:${SITE_CONTACT.email}`}>
                  {a("contact")}
                </a>
              </p>
            ) : null}
          </div>
        </section>

        <section className="vmb-card p-7">
          <h2 className="text-xl font-bold">{a("buyCredits")}</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {VMB_CREDIT_PACKS.map((p) => (
              <div key={p.id} className="rounded-2xl border border-[color:var(--vmb-line)] p-5">
                <p className="vmb-display text-3xl font-extrabold">{a("packCredits", { n: p.credits.toLocaleString("en-US") })}</p>
                <p className="mt-1 text-sm text-[color:var(--vmb-muted)]">
                  {money(withVat(p.priceMinor))} {a("vatIncl")}
                </p>
                <div className="mt-4">
                  {paypalOn && ent.active ? <VmbPayPalButton purchase={{ kind: "credits", packId: p.id }} {...payLabels} /> : null}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="vmb-card p-7">
            <h2 className="text-xl font-bold">{a("ledgerTitle")}</h2>
            {ledger.length === 0 ? (
              <p className="mt-4 text-sm text-[color:var(--vmb-muted)]">{a("empty")}</p>
            ) : (
              <ul className="mt-4 divide-y divide-[color:var(--vmb-line)] text-sm">
                {ledger.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 py-3">
                    <span>
                      {a(`reason_${m.reason}`)}
                      <span className="ms-2 text-xs text-[color:var(--vmb-muted)]">{day(m.createdAt)}</span>
                    </span>
                    <span className={`vmb-mono font-semibold ${m.delta > 0 ? "text-[color:var(--vmb-pass)]" : "text-[color:var(--vmb-ink-soft)]"}`}>
                      {m.delta > 0 ? `+${m.delta}` : m.delta}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="vmb-card p-7">
            <h2 className="text-xl font-bold">{a("paymentsTitle")}</h2>
            {payments.length === 0 ? (
              <p className="mt-4 text-sm text-[color:var(--vmb-muted)]">{a("empty")}</p>
            ) : (
              <ul className="mt-4 divide-y divide-[color:var(--vmb-line)] text-sm">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                    <span>
                      {a(`kind_${p.kind}`)}
                      <span className="ms-2 text-xs text-[color:var(--vmb-muted)]">{day(p.createdAt)}</span>
                    </span>
                    <span className="vmb-mono">{money(p.amountMinor)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
        <section className="grid gap-4 md:grid-cols-2">
          <MembersCard
            me={user.id}
            isOwner={ws.role === "owner"}
            members={people.members}
            invites={people.invites}
            labels={{
              title: a("membersTitle"),
              owner: a("m_owner"),
              member: a("m_member"),
              you: a("m_you"),
              pending: a("m_pending"),
              invitePlaceholder: a("m_invitePlaceholder"),
              invite: a("m_invite"),
              invited: a("m_invited"),
              remove: a("m_remove"),
              revoke: a("m_revoke"),
              ownerOnly: a("m_ownerOnly"),
              errors: memberErrors,
            }}
          />
          <div className="vmb-card p-7">
            <h2 className="text-xl font-bold">{a("usageTitle")}</h2>
            {usage.length === 0 ? (
              <p className="mt-4 text-sm text-[color:var(--vmb-muted)]">{a("usageEmpty")}</p>
            ) : (
              <ul className="mt-4 divide-y divide-[color:var(--vmb-line)] text-sm">
                {usage.map((u) => (
                  <li key={u.projectId} className="flex items-center justify-between gap-3 py-3">
                    <VmbLink href={`/app/p/${u.projectId}`} className="min-w-0 truncate hover:text-[color:var(--vmb-accent)]">
                      {u.name}
                    </VmbLink>
                    <span className="shrink-0 text-xs text-[color:var(--vmb-ink-soft)]">{a("usageLine", { n: u.credits.toLocaleString("en-US"), b: String(u.booklets) })}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <RetentionPicker
          initial={policy?.fileRetentionDays ?? null}
          canEdit={ws.role === "owner"}
          labels={{ title: a("retentionTitle"), body: a("retentionBody"), days: a("retentionDays"), never: a("retentionNever"), ownerOnly: a("retentionOwnerOnly"), failed: a("retentionFailed") }}
        />
      </main>
    </div>
  );
}
