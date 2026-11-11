import Image from "next/image";
import type { TFunction } from "@/lib/i18n/translate";

export const K = "vmb.";

export const WRAP = "mx-auto max-w-7xl px-5 sm:px-10";

export function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-5 flex items-center gap-3 text-sm font-medium tracking-wide text-[color:var(--vmb-accent)]">
      <span className="inline-block h-px w-10 bg-[color:var(--vmb-accent)]" />
      {children}
    </p>
  );
}

export function SectionHead({ kicker, title, lead }: { kicker: string; title: string; lead?: string }) {
  return (
    <div className="max-w-3xl">
      <Kicker>{kicker}</Kicker>
      <h2 className="vmb-display text-4xl leading-[1.02] font-extrabold sm:text-6xl">{title}</h2>
      {lead ? <p className="mt-6 max-w-2xl text-lg leading-relaxed font-light text-[color:var(--vmb-ink-soft)]">{lead}</p> : null}
    </div>
  );
}

export function StatsStrip({ t }: { t: TFunction }) {
  const items = ["touch", "bound", "steps", "formats"] as const;
  return (
    <dl className="grid grid-cols-2 gap-px border-y border-[color:var(--vmb-line)] bg-[color:var(--vmb-line)] lg:grid-cols-4">
      {items.map((k) => (
        <div key={k} className="flex flex-col-reverse bg-[color:var(--vmb-bg)] px-6 py-10 sm:px-10 sm:py-14">
          <dt className="mt-3 text-sm text-[color:var(--vmb-muted)]">{t(`${K}stats.${k}Label`)}</dt>
          <dd className="vmb-display text-5xl font-extrabold sm:text-7xl">{t(`${K}stats.${k}Value`)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function HowSection({ t }: { t: TFunction }) {
  const steps = [1, 2, 3, 4, 5, 6, 7];
  return (
    <section id="how" className={`${WRAP} scroll-mt-20 py-28 sm:py-40`}>
      <SectionHead kicker={t(`${K}how.kicker`)} title={t(`${K}how.title`)} lead={t(`${K}how.lead`)} />
      <ol className="mt-16 border-b border-[color:var(--vmb-line)]">
        {steps.map((n) => (
          <li
            key={n}
            className="group grid items-baseline gap-x-10 gap-y-2 border-t border-[color:var(--vmb-line)] py-8 transition-colors hover:bg-white/[.02] sm:grid-cols-[140px_minmax(0,1fr)_minmax(0,1.3fr)] sm:py-10"
          >
            <span className="vmb-display vmb-outline text-6xl leading-none font-extrabold transition-[-webkit-text-stroke-color] group-hover:[-webkit-text-stroke-color:var(--vmb-accent)] sm:text-7xl">
              {String(n).padStart(2, "0")}
            </span>
            <h3 className="text-2xl font-bold sm:text-3xl">{t(`${K}how.s${n}Title`)}</h3>
            <p className="text-base leading-relaxed font-light text-[color:var(--vmb-ink-soft)] sm:text-lg">{t(`${K}how.s${n}Body`)}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Bar({ value }: { value: number }) {
  return (
    <span className="mt-1.5 block h-1 w-full overflow-hidden rounded-full bg-[color:var(--vmb-line)]">
      <span className="block h-full rounded-full bg-[color:var(--vmb-pass)]" style={{ width: `${value}%` }} />
    </span>
  );
}

export function AccuracySection({ t }: { t: TFunction }) {
  const rows = [
    { label: t(`${K}accuracy.rowGround`), scale: "1:200", median: "0.04", within: 100 },
    { label: t(`${K}accuracy.rowFirst`), scale: "1:200", median: "0.03", within: 100 },
  ];
  return (
    <section id="accuracy" className="relative scroll-mt-20 overflow-hidden py-28 sm:py-40">
      <Image src="/floorplan-viz/styles/contemporary.jpg" alt="" fill sizes="100vw" className="object-cover opacity-40" />
      <div className="absolute inset-0 bg-gradient-to-l from-[color:var(--vmb-bg)] via-[color:var(--vmb-bg)]/85 to-[color:var(--vmb-bg)]/40" />
      <div className={`${WRAP} relative grid items-center gap-14 lg:grid-cols-[1fr_1fr]`}>
        <SectionHead kicker={t(`${K}accuracy.kicker`)} title={t(`${K}accuracy.title`)} lead={t(`${K}accuracy.lead`)} />
        <div className="vmb-glass overflow-hidden rounded-[var(--vmb-radius)]">
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
            <div>
              <p className="text-xl font-bold">{t(`${K}accuracy.certTitle`)}</p>
              <p className="mt-0.5 text-xs text-[color:var(--vmb-muted)]">{t(`${K}accuracy.certProject`)}</p>
            </div>
            <span className="rounded-full bg-[color:var(--vmb-pass)]/15 px-3 py-1 text-xs font-bold text-[color:var(--vmb-pass)]">
              {t(`${K}accuracy.gradePass`)}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-[color:var(--vmb-muted)]">
                <tr>
                  {["colSheet", "colScale", "colMedian", "colWithin"].map((c) => (
                    <th key={c} className="px-4 py-3 text-start font-medium sm:px-6">
                      {t(`${K}accuracy.${c}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label} className="border-t border-white/10">
                    <td className="px-4 py-4 sm:px-6 font-medium">{r.label}</td>
                    <td className="px-4 py-4 sm:px-6">
                      <span className="vmb-mono">{r.scale}</span>
                    </td>
                    <td className="px-4 py-4 sm:px-6">
                      <span className="vmb-mono text-[color:var(--vmb-measure)]">{r.median} m</span>
                    </td>
                    <td className="px-4 py-4 sm:px-6">
                      <span className="vmb-mono text-xs">{r.within}%</span>
                      <Bar value={r.within} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid grid-cols-2 border-t border-white/10">
            {[
              ["94%", "paintKept"],
              ["3%", "paintAdded"],
            ].map(([v, k], i) => (
              <div key={k} className={`p-6 ${i ? "border-s border-white/10" : ""}`}>
                <p className="text-xs text-[color:var(--vmb-muted)]">{t(`${K}accuracy.paintTitle`)}</p>
                <p className="vmb-display mt-1 text-4xl font-extrabold">{v}</p>
                <p className="text-xs text-[color:var(--vmb-ink-soft)]">{t(`${K}accuracy.${k}`)}</p>
              </div>
            ))}
          </div>
          <p className="border-t border-white/10 px-6 py-3 text-[11px] leading-relaxed text-[color:var(--vmb-muted)]">{t(`${K}accuracy.legal`)}</p>
        </div>
      </div>
    </section>
  );
}
