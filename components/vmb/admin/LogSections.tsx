import type { adminLog, SystemState } from "@/lib/vmb/costs-store";
import { VmbLink } from "@/components/vmb/VmbLink";

type T = (k: string, vars?: Record<string, string>) => string;

const when = (d: Date) => d.toLocaleString("he-IL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const LOGGED = ["retry", "bench", "grant", "activate", "freeze", "unfreeze", "extend", "refund", "rate_set", "rate_clear", "fixed_add", "fixed_end", "fixed_delete"];

/** What the detail holds, shown as it was sent: the amount, the days, the rate. Never free text from a client. */
function detailText(detail: unknown): string {
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return "";
  return Object.entries(detail as Record<string, unknown>)
    .filter(([k, v]) => k !== "action" && (typeof v === "string" || typeof v === "number"))
    .map(([k, v]) => `${k}=${String(v).slice(0, 60)}`)
    .join(" · ");
}

export function AdminTabs({ current, labels }: { current: string; labels: Record<"overview" | "costs" | "log", string> }) {
  return (
    <nav className="flex flex-wrap gap-2" aria-label={labels.overview}>
      {(["overview", "costs", "log"] as const).map((k) => (
        <VmbLink
          key={k}
          href={k === "overview" ? "/admin" : `/admin?tab=${k}`}
          aria-current={current === k ? "page" : undefined}
          className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${
            current === k
              ? "border-[color:var(--vmb-accent)] bg-[color:var(--vmb-accent)] text-[color:var(--vmb-accent-ink)]"
              : "border-[color:var(--vmb-line)] text-[color:var(--vmb-ink-soft)] hover:text-[color:var(--vmb-ink)]"
          }`}
        >
          {labels[k]}
        </VmbLink>
      ))}
    </nav>
  );
}

/** Previous / next for one list; the other lists' pages and the search stay as they are in the address. */
export function Pager({ page, more, param, query, labels }: { page: number; more: boolean; param: string; query: Record<string, string | undefined>; labels: { prev: string; next: string } }) {
  if (page === 0 && !more) return null;
  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...query, [param]: p > 0 ? String(p) : undefined })) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `/admin?${s}` : "/admin";
  };
  const cls = "rounded-full border border-[color:var(--vmb-line)] px-3 py-1 text-xs font-semibold";
  return (
    <nav className="flex items-center justify-end gap-2">
      {page > 0 ? (
        <VmbLink href={href(page - 1)} className={cls}>
          {labels.prev}
        </VmbLink>
      ) : null}
      <span className="vmb-mono text-xs text-[color:var(--vmb-muted)]">{page + 1}</span>
      {more ? (
        <VmbLink href={href(page + 1)} className={cls}>
          {labels.next}
        </VmbLink>
      ) : null}
    </nav>
  );
}

export function SystemPanel({ state, t }: { state: SystemState; t: T }) {
  return (
    <section className="vmb-card p-6">
      <h2 className="text-lg font-bold">{t("sysTitle")}</h2>
      <p className="mt-1 text-xs text-[color:var(--vmb-muted)]">{t("sysLead")}</p>
      <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
        {state.map((s) => (
          <li key={s.key} className="flex items-center justify-between gap-2 rounded-xl border border-[color:var(--vmb-line)] px-3 py-2">
            <span>{t(`sys_${s.key}`)}</span>
            <span className={`text-xs font-semibold ${s.on ? "text-[color:var(--vmb-pass)]" : "text-[color:var(--vmb-warn)]"}`}>{t(s.on ? "sys_on" : "sys_off")}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function LogPanel({ rows, t }: { rows: Awaited<ReturnType<typeof adminLog>>; t: T }) {
  return (
    <section className="vmb-card p-6">
      <h2 className="text-lg font-bold">{t("logTitle")}</h2>
      {rows.length === 0 ? <p className="mt-3 text-sm text-[color:var(--vmb-muted)]">{t("empty")}</p> : null}
      <ul className="mt-3 divide-y divide-[color:var(--vmb-line)] text-xs">
        {rows.map((r) => (
          <li key={r.id} className="space-y-0.5 py-2.5">
            <p className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-semibold">
                {LOGGED.includes(r.action) ? t(`log_${r.action}`) : r.action}
                {r.ok ? "" : ` · ${t("log_failed")}`}
              </span>
              <span className="text-[color:var(--vmb-muted)]">{when(r.createdAt)}</span>
            </p>
            <p className="vmb-mono break-all text-[color:var(--vmb-ink-soft)]" dir="ltr">
              {r.adminEmail}
              {r.workspaceId ? ` · ${r.workspaceId}` : ""}
              {detailText(r.detail) ? ` · ${detailText(r.detail)}` : ""}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
