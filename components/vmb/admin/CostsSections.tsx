import { COST_RATE_KEYS, type CostLine } from "@/lib/vmb/costs";
import type { AdminCosts } from "@/lib/vmb/costs-store";
import { FixedCostForm, FixedRowActions, RateField } from "@/components/vmb/admin/CostForms";

type T = (k: string, vars?: Record<string, string>) => string;

const n = (v: number) => v.toLocaleString("en-US");
const money = (minor: number) => `⁦₪${(minor / 100).toLocaleString("en-US", { maximumFractionDigits: Math.abs(minor) < 100_000 ? 2 : 0 })}⁩`;
const day = (d: Date) => d.toLocaleDateString("he-IL", { day: "numeric", month: "short", year: "numeric" });
const GB = 1024 ** 3;

function Tile({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: string }) {
  return (
    <div className="vmb-card p-5">
      <p className="text-xs text-[color:var(--vmb-muted)]">{label}</p>
      <p className={`vmb-display mt-1 text-3xl font-extrabold ${tone ?? ""}`}>{value}</p>
      {note ? <p className="mt-1 text-xs text-[color:var(--vmb-ink-soft)]">{note}</p> : null}
    </div>
  );
}

function qtyText(l: CostLine, t: T): string {
  if (l.key === "compute") return t("qty_compute", { n: n(Math.round(l.qty / 60)) });
  if (l.key === "storage") return t("qty_storage", { n: (l.qty / GB).toLocaleString("en-US", { maximumFractionDigits: 2 }) });
  return t(`qty_${l.key}`, { n: n(l.qty) });
}

/** The month in numbers: what it cost, what came in, and what a booklet and a painted picture cost. */
export function CostsSummary({ c, t }: { c: AdminCosts; t: T }) {
  const r = c.report;
  const none = t("none");
  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <Tile label={t("c_total")} value={money(r.totalMinor)} note={r.missing.length ? t("c_partial") : undefined} tone={r.missing.length ? "text-[color:var(--vmb-warn)]" : undefined} />
      <Tile label={t("c_revenue")} value={money(r.revenueMinor)} />
      <Tile label={t("c_margin")} value={money(r.marginMinor)} tone={r.marginMinor < 0 ? "text-[color:var(--vmb-fail)]" : "text-[color:var(--vmb-pass)]"} />
      <Tile label={t("c_perBooklet")} value={r.perBookletMinor == null ? none : money(r.perBookletMinor)} note={t("c_perBookletNote", { n: n(r.booklets) })} />
      <Tile label={t("c_perPainted")} value={r.perPaintedMinor == null ? none : money(r.perPaintedMinor)} note={t("c_perPaintedNote", { n: n(r.picturesPainted) })} />
    </section>
  );
}

/** Each cost line with what it counted; a line waiting for a rate says which. */
export function CostLines({ c, t }: { c: AdminCosts; t: T }) {
  const r = c.report;
  return (
    <section className="vmb-card p-6">
      <h2 className="text-lg font-bold">{t("c_linesTitle")}</h2>
      <ul className="mt-3 divide-y divide-[color:var(--vmb-line)] text-sm">
        {r.lines.map((l) => (
          <li key={l.key} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
            <span>
              <span className="font-semibold">{t(`line_${l.key}`)}</span>
              <span className="ms-2 text-xs text-[color:var(--vmb-muted)]">{qtyText(l, t)}</span>
            </span>
            {l.minor == null ? (
              <span className="text-xs text-[color:var(--vmb-warn)]">{l.missing.map((m) => t("c_needRate", { rate: t(`rate_${m}`) })).join(" · ")}</span>
            ) : (
              <span className="vmb-mono">{money(l.minor)}</span>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-3 space-y-1 text-xs text-[color:var(--vmb-muted)]">
        <p>{c.rate ? t("c_fx", { v: c.rate.usdToIls.toFixed(3), date: c.rate.date }) : t("c_noFx")}</p>
        {r.aiUnpricedCalls ? <p className="text-[color:var(--vmb-warn)]">{t("c_unpriced", { n: n(r.aiUnpricedCalls) })}</p> : null}
        {c.otherEnvCalls ? <p>{t("c_otherEnv", { n: n(c.otherEnvCalls) })}</p> : null}
      </div>
    </section>
  );
}

export function CostOffices({ c, t }: { c: AdminCosts; t: T }) {
  const offices = c.report.offices;
  return (
    <section className="vmb-card p-6">
      <h2 className="text-lg font-bold">{t("c_officesTitle")}</h2>
      {offices.length === 0 ? <p className="mt-3 text-sm text-[color:var(--vmb-muted)]">{t("empty")}</p> : null}
      <ul className="mt-3 divide-y divide-[color:var(--vmb-line)] text-xs">
        {offices.map((o) => (
          <li key={o.workspaceId} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
            <span className="font-semibold">{c.officeNames[o.workspaceId] ?? t("c_officeUnknown")}</span>
            <span className="text-[color:var(--vmb-ink-soft)]">{t("c_officeLine", { cost: money(o.costMinor), rev: money(o.revenueMinor), n: n(o.booklets) })}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CostRatesPanel({ c, t }: { c: AdminCosts; t: T }) {
  const labels = { save: t("c_save"), clear: t("c_clear"), unset: t("c_rateUnset"), failed: t("err_failed") };
  return (
    <section className="vmb-card p-6">
      <h2 className="text-lg font-bold">{t("c_ratesTitle")}</h2>
      <p className="mt-1 text-xs text-[color:var(--vmb-muted)]">{t("c_ratesLead")}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {COST_RATE_KEYS.map((k) => (
          <RateField key={k} rateKey={k} label={t(`rate_${k}`)} value={c.rates[k] ?? null} labels={labels} />
        ))}
      </div>
    </section>
  );
}

export function FixedCostsPanel({ c, t, today }: { c: AdminCosts; t: T; today: string }) {
  const thisMonth = new Map(c.report.fixedRows.map((r) => [r.id, r.minor]));
  const sym = (cur: string) => (cur === "USD" ? "$" : "₪");
  return (
    <section className="vmb-card p-6">
      <h2 className="text-lg font-bold">{t("c_fixedTitle")}</h2>
      <p className="mt-1 text-xs text-[color:var(--vmb-muted)]">{t("c_fixedLead")}</p>
      <ul className="mt-3 divide-y divide-[color:var(--vmb-line)] text-xs">
        {c.fixed.map((f) => {
          const m = thisMonth.get(f.id);
          return (
            <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span>
                <span className="font-semibold">{f.vendor}</span>
                <span className="vmb-mono ms-2">{t("f_perMonth", { v: `⁦${sym(f.currency)}${n(f.amountMinor / 100)}⁩` })}</span>
                <span className="ms-2 text-[color:var(--vmb-muted)]">
                  {t("f_since", { date: day(f.startsOn) })}
                  {f.endsOn ? ` · ${t("f_until", { date: day(f.endsOn) })}` : ""}
                  {m != null ? ` · ${t("f_thisMonth", { v: money(m) })}` : ""}
                </span>
              </span>
              <FixedRowActions id={f.id} today={today} running={!f.endsOn} labels={{ end: t("f_end"), remove: t("f_delete"), failed: t("err_failed") }} />
            </li>
          );
        })}
      </ul>
      <FixedCostForm today={today} labels={{ vendor: t("f_vendor"), amount: t("f_amount"), currency: t("f_currency"), from: t("f_from"), note: t("f_note"), add: t("f_add"), failed: t("err_failed") }} />
    </section>
  );
}
