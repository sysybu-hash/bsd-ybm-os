import Image from "next/image";
import { ArrowLeft, Check, DoorOpen, Laptop, Layers, Map, Ruler, ScanSearch, ShieldCheck, Sofa, SplitSquareHorizontal } from "lucide-react";
import { SITE_CONTACT } from "@/lib/site-contact";
import type { TFunction } from "@/lib/i18n/translate";
import { VmbLink } from "@/components/vmb/VmbLink";
import { K, Kicker, SectionHead, WRAP } from "@/components/vmb/landing/LandingSections";

const SHOTS = [
  { src: "jerusalem_stone", key: "g1", chip: "±0.03 m", span: "lg:col-span-7 aspect-[4/3]" },
  { src: "contemporary", key: "g2", chip: "±0.04 m", span: "lg:col-span-5 aspect-[4/3] lg:aspect-auto" },
  { src: "luxury", key: "g3", chip: "±0.02 m", span: "lg:col-span-5 aspect-[4/3] lg:aspect-auto" },
  { src: "scandi", key: "g4", chip: "±0.03 m", span: "lg:col-span-7 aspect-[4/3]" },
];

export function GallerySection({ t }: { t: TFunction }) {
  return (
    <section id="work" className="scroll-mt-20 pb-28 sm:pb-40">
      <div className={WRAP}>
        <SectionHead kicker={t(`${K}gallery.kicker`)} title={t(`${K}gallery.title`)} lead={t(`${K}gallery.lead`)} />
      </div>
      <div className="mt-16 grid gap-2 px-2 lg:grid-cols-12">
        {SHOTS.map((s) => (
          <figure key={s.src} className={`group relative overflow-hidden ${s.span}`}>
            <Image
              src={`/floorplan-viz/styles/${s.src}.jpg`}
              alt={t(`${K}gallery.${s.key}`)}
              fill
              sizes="(min-width: 1024px) 60vw, 100vw"
              className="object-cover transition duration-[1.2s] ease-out group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
            <figcaption className="absolute inset-x-6 bottom-5 flex items-end justify-between gap-4">
              <span className="text-2xl font-bold">{t(`${K}gallery.${s.key}`)}</span>
              <span className="vmb-chip">{s.chip}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

export function ReadsSection({ t }: { t: TFunction }) {
  const items = [
    { k: "walls", icon: Layers, span: "lg:col-span-2" },
    { k: "openings", icon: DoorOpen, span: "" },
    { k: "levels", icon: Ruler, span: "" },
    { k: "survey", icon: Map, span: "" },
    { k: "furniture", icon: Sofa, span: "" },
    { k: "proposals", icon: SplitSquareHorizontal, span: "lg:col-span-2" },
  ];
  return (
    <section id="reads" className={`${WRAP} scroll-mt-20 pb-28 sm:pb-40`}>
      <SectionHead kicker={t(`${K}reads.kicker`)} title={t(`${K}reads.title`)} lead={t(`${K}reads.lead`)} />
      <div className="mt-16 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map(({ k, icon: Icon, span }) => (
          <article key={k} className={`vmb-card group p-8 transition-colors hover:border-[color:var(--vmb-accent)]/50 ${span}`}>
            <Icon className="h-6 w-6 text-[color:var(--vmb-measure)]" strokeWidth={1.5} aria-hidden />
            <h3 className="mt-10 text-xl font-bold">{t(`${K}reads.${k}`)}</h3>
            <p className="mt-2 text-sm leading-relaxed text-[color:var(--vmb-ink-soft)]">{t(`${K}reads.${k}Body`)}</p>
          </article>
        ))}
        <article className="relative overflow-hidden rounded-[var(--vmb-radius)] bg-gradient-to-l from-[#ff8a4c] to-[#c2410c] p-8 text-[#120700] sm:col-span-2 lg:col-span-4 lg:flex lg:items-center lg:justify-between lg:gap-10 lg:p-12">
          <div className="flex items-center gap-5">
            <ScanSearch className="h-10 w-10 shrink-0" strokeWidth={1.5} aria-hidden />
            <h3 className="vmb-display text-3xl font-extrabold sm:text-4xl">{t(`${K}reads.rescan`)}</h3>
          </div>
          <p className="mt-4 max-w-xl text-lg leading-relaxed lg:mt-0">{t(`${K}reads.rescanBody`)}</p>
        </article>
      </div>
    </section>
  );
}

export function PrivacyPricing({ t }: { t: TFunction }) {
  const inc = [1, 2, 3, 4, 5];
  return (
    <div className={`${WRAP} grid gap-16 pb-28 sm:pb-40 lg:grid-cols-2 lg:gap-10`}>
      <section className="flex flex-col justify-between gap-10">
        <SectionHead kicker={t(`${K}privacy.kicker`)} title={t(`${K}privacy.title`)} lead={t(`${K}privacy.body`)} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="vmb-card p-6">
            <Laptop className="h-6 w-6 text-[color:var(--vmb-measure)]" strokeWidth={1.5} aria-hidden />
            <h3 className="mt-6 text-lg font-bold">{t(`${K}privacy.localTitle`)}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-[color:var(--vmb-ink-soft)]">{t(`${K}privacy.localBody`)}</p>
          </div>
          <div className="vmb-card p-6">
            <ShieldCheck className="h-6 w-6 text-[color:var(--vmb-measure)]" strokeWidth={1.5} aria-hidden />
            <h3 className="mt-6 text-lg font-bold">{t(`${K}accuracy.certTitle`)}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-[color:var(--vmb-ink-soft)]">{t(`${K}accuracy.legal`)}</p>
          </div>
        </div>
      </section>
      <section id="pricing" className="relative scroll-mt-20 overflow-hidden rounded-[28px] border border-[color:var(--vmb-line-strong)] bg-[color:var(--vmb-bg-raised)] p-8 sm:p-12">
        <div className="pointer-events-none absolute -top-32 -left-32 h-80 w-80 rounded-full bg-[color:var(--vmb-accent)]/25 blur-[100px]" />
        <Kicker>{t(`${K}pricing.kicker`)}</Kicker>
        <h2 className="vmb-display relative text-3xl font-extrabold sm:text-4xl">{t(`${K}pricing.title`)}</h2>
        <p className="mt-10 text-sm font-medium text-[color:var(--vmb-muted)]">{t(`${K}pricing.plan`)}</p>
        <p className="mt-1 flex flex-wrap items-baseline gap-3">
          <span className="vmb-display text-6xl font-extrabold sm:text-7xl">{t(`${K}pricing.price`)}</span>
          <span className="text-[color:var(--vmb-ink-soft)]">
            {t(`${K}pricing.vat`)} · {t(`${K}pricing.per`)}
          </span>
        </p>
        <ul className="mt-10 space-y-3.5">
          {inc.map((n) => (
            <li key={n} className="flex items-start gap-3">
              <Check className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--vmb-accent)]" aria-hidden />
              {t(`${K}pricing.inc${n}`)}
            </li>
          ))}
        </ul>
        <a
          href={`mailto:${SITE_CONTACT.email}`}
          className="mt-12 block rounded-full bg-[color:var(--vmb-accent)] px-6 py-4 text-center font-medium text-[color:var(--vmb-accent-ink)] transition-transform hover:-translate-y-0.5"
        >
          {t(`${K}pricing.cta`)}
        </a>
        <p className="mt-3 text-center text-xs text-[color:var(--vmb-muted)]">{t(`${K}pricing.note`)}</p>
      </section>
    </div>
  );
}

export function FaqSection({ t }: { t: TFunction }) {
  const qs = [1, 2, 3, 4];
  return (
    <section className={`${WRAP} pb-28 sm:pb-40`}>
      <Kicker>{t(`${K}faq.kicker`)}</Kicker>
      <div className="grid gap-x-16 md:grid-cols-2">
        {qs.map((n) => (
          <details key={n} className="group border-b border-[color:var(--vmb-line)] py-7">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-xl font-bold">
              {t(`${K}faq.q${n}`)}
              <span className="text-2xl font-light text-[color:var(--vmb-accent)] transition-transform group-open:rotate-45">+</span>
            </summary>
            <p className="mt-4 leading-relaxed text-[color:var(--vmb-ink-soft)]">{t(`${K}faq.a${n}`)}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function FinalCta({ t }: { t: TFunction }) {
  return (
    <section className="relative overflow-hidden">
      <Image src="/floorplan-viz/styles/haredi_modern.jpg" alt="" fill sizes="100vw" className="vmb-kenburns object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-[color:var(--vmb-bg)] via-black/60 to-black/40" />
      <div className={`${WRAP} relative py-36 sm:py-52`}>
        <h2 className="vmb-display max-w-4xl text-5xl leading-[.98] font-extrabold sm:text-8xl">{t(`${K}cta.title`)}</h2>
        <p className="mt-6 max-w-xl text-lg font-light text-white/75">{t(`${K}cta.lead`)}</p>
        <VmbLink
          href="/login"
          className="mt-10 inline-flex items-center gap-3 rounded-full bg-[color:var(--vmb-accent)] px-8 py-4 font-medium text-[color:var(--vmb-accent-ink)] transition-transform hover:-translate-y-0.5"
        >
          {t(`${K}cta.button`)}
          <ArrowLeft className="h-4 w-4 ltr:rotate-180" aria-hidden />
        </VmbLink>
      </div>
    </section>
  );
}
