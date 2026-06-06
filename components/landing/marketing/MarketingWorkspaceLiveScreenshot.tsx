"use client";

import Image from "next/image";
import { useI18n } from "@/components/os/system/I18nProvider";

type Props = Readonly<{
  className?: string;
}>;

export default function MarketingWorkspaceLiveScreenshot({ className = "" }: Props) {
  const { t } = useI18n();

  return (
    <figure
      className={`mkt-glass mkt-hero-demo-card mkt-workspace-live-shot flex h-full min-h-[280px] flex-col overflow-hidden rounded-3xl border-2 border-white/20 shadow-2xl ${className}`.trim()}
    >
      <div className="mkt-hero-demo-chrome relative shrink-0 border-b border-white/10 bg-slate-950/80 px-4 py-2.5">
        <div className="absolute start-4 top-1/2 flex -translate-y-1/2 gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
        </div>
        <p className="text-center text-xs font-bold text-slate-300">bsd-ybm.co.il</p>
      </div>
      <div className="relative min-h-0 flex-1 bg-slate-950">
        <Image
          src="/screenshots/app-builder.png"
          alt={t("marketingHome.panels.demo.workspaceScreenshotAlt")}
          fill
          className="object-cover object-[center_top]"
          sizes="(max-width: 1024px) 100vw, 640px"
          priority={false}
        />
      </div>
      <figcaption className="shrink-0 border-t border-white/10 bg-slate-950/90 px-3 py-2 text-center text-[11px] font-semibold text-slate-400">
        {t("marketingHome.panels.demo.workspaceScreenshotCaption")}
      </figcaption>
    </figure>
  );
}
