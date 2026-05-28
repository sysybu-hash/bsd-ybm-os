"use client";

import { useCallback, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  FileText,
  LayoutDashboard,
  Settings,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";

const MOCK_NAV_IDS = ["dashboard", "crm", "documents", "billing", "analytics", "settings"] as const;
type MockNavId = (typeof MOCK_NAV_IDS)[number];

const SIDEBAR_ITEMS: ReadonlyArray<{ id: MockNavId; icon: LucideIcon }> = [
  { id: "dashboard", icon: LayoutDashboard },
  { id: "crm", icon: Users },
  { id: "documents", icon: FileText },
  { id: "billing", icon: Wallet },
  { id: "analytics", icon: BarChart3 },
  { id: "settings", icon: Settings },
];

const LIST_VIEW_IDS = ["crm", "documents", "billing", "analytics", "settings"] as const;
const LIST_ITEM_INDICES = [0, 1, 2] as const;
const STAT_INDICES = [0, 1, 2, 3] as const;
const CHART_HEIGHTS = [40, 65, 45, 80, 55, 90, 70] as const;

type Props = Readonly<{
  className?: string;
  interactive?: boolean;
}>;

function MockListView({
  viewId,
  t,
}: {
  viewId: (typeof LIST_VIEW_IDS)[number];
  t: (key: string) => string;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="shrink-0 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4">
        <h3 className="text-sm font-bold text-white">{t(`marketingHome.mock.views.${viewId}.title`)}</h3>
        <p className="mt-1.5 text-xs font-medium leading-relaxed text-slate-300">
          {t(`marketingHome.mock.views.${viewId}.lead`)}
        </p>
      </div>
      <ul className="flex min-h-0 flex-1 flex-col gap-2">
        {LIST_ITEM_INDICES.map((i) => (
          <li
            key={i}
            className="rounded-xl border border-white/10 bg-slate-900/55 px-3 py-2.5 text-xs font-semibold leading-snug text-slate-200 transition hover:border-emerald-400/30 hover:bg-slate-900/80"
          >
            {t(`marketingHome.mock.views.${viewId}.items.${i}`)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function MockDashboardView({ t }: { t: (key: string) => string }) {
  return (
    <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2 lg:items-stretch">
      <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-3">
        <p className="text-[10px] font-bold uppercase tracking-wide text-amber-200/80">
          {t("marketingHome.mock.attentionLabel")}
        </p>
        <p className="mt-1 text-sm font-bold text-white">{t("marketingHome.mock.attentionTitle")}</p>
      </div>

      <div className="rounded-2xl border border-emerald-500/35 bg-emerald-950/40 p-3 shadow-[0_0_24px_rgba(52,211,153,0.15)]">
        <div className="mb-2 flex items-center gap-2 text-emerald-300">
          <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
          <span className="text-xs font-bold">{t("marketingHome.mock.suggestLabel")}</span>
        </div>
        <p className="text-sm font-bold leading-snug text-white">{t("marketingHome.mock.suggestTitle")}</p>
        <p className="mt-2 text-xs font-medium leading-relaxed text-emerald-100/80">
          {t("marketingHome.mock.suggestBody")}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {STAT_INDICES.map((i) => (
          <div key={i} className="rounded-xl border border-white/10 bg-slate-900/50 p-2.5">
            <p className="text-[10px] font-medium text-slate-400">
              {t(`marketingHome.mock.stats.${i}.label`)}
            </p>
            <p className="text-sm font-black text-white">{t(`marketingHome.mock.stats.${i}.value`)}</p>
          </div>
        ))}
      </div>

      <div className="flex min-h-[7.5rem] flex-col rounded-2xl border border-white/10 bg-slate-900/40 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-slate-300">{t("marketingHome.mock.financeLabel")}</span>
          <span className="shrink-0 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
            {t("marketingHome.mock.boardBadge")}
          </span>
        </div>
        <div className="mt-auto flex h-14 items-end gap-1">
          {CHART_HEIGHTS.map((h, idx) => (
            <div
              key={idx}
              className="flex-1 rounded-t bg-gradient-to-t from-amber-600/40 to-amber-300/70"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function DesktopOsMockup({ className = "", interactive = true }: Props) {
  const { t } = useI18n();
  const [activeId, setActiveId] = useState<MockNavId>("dashboard");

  const headerTitle =
    activeId === "dashboard"
      ? t("marketingHome.mock.boardTitle")
      : t(`marketingHome.mock.views.${activeId}.title`);

  const onNavKeyDown = useCallback((e: React.KeyboardEvent, index: number) => {
    if (!interactive) return;
    let next = index;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault();
      next = (index + 1) % SIDEBAR_ITEMS.length;
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      next = (index - 1 + SIDEBAR_ITEMS.length) % SIDEBAR_ITEMS.length;
    } else if (e.key === "Home") {
      e.preventDefault();
      next = 0;
    } else if (e.key === "End") {
      e.preventDefault();
      next = SIDEBAR_ITEMS.length - 1;
    } else {
      return;
    }
    const item = SIDEBAR_ITEMS[next];
    if (item) setActiveId(item.id);
  }, [interactive]);

  return (
    <div
      className={`mkt-glass mkt-hero-demo-card mkt-os-mock overflow-hidden rounded-3xl border-2 border-white/20 p-2 shadow-2xl ${className}`.trim()}
    >
      <div className="mkt-hero-demo-inner flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.35rem] bg-slate-950">
        <div className="mkt-hero-demo-chrome relative bg-slate-950/50">
          <div className="absolute start-4 top-1/2 flex -translate-y-1/2 gap-1.5" aria-hidden>
            <span className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
          </div>
          <p className="text-center text-xs font-bold text-slate-300">{headerTitle}</p>
        </div>

        {interactive ? (
          <p className="border-b border-white/5 bg-slate-950/60 px-3 py-1.5 text-center text-[10px] font-semibold text-amber-200/90">
            {t("marketingHome.mock.demoNavHint")}
          </p>
        ) : null}

        <div className="flex min-h-0 flex-1">
          <aside
            className="flex w-14 shrink-0 flex-col items-center gap-2 border-e border-white/10 bg-slate-950/40 py-3"
            role={interactive ? "tablist" : undefined}
            aria-label={t("marketingHome.mock.boardTitle")}
          >
            {SIDEBAR_ITEMS.map(({ id, icon: Icon }, index) => {
              const isActive = activeId === id;
              const label = t(`marketingHome.mock.sidebar.${id}`);
              const commonClass = `mkt-os-mock-nav-btn flex h-9 w-9 items-center justify-center rounded-xl transition ${
                isActive ? "is-active bg-amber-500/25 text-amber-100 shadow-[0_0_16px_rgba(251,191,36,0.25)]" : "text-slate-500 hover:bg-white/10 hover:text-slate-200"
              }`;

              if (!interactive) {
                return (
                  <div key={id} className={commonClass} title={label}>
                    <Icon className="h-4 w-4" aria-hidden />
                  </div>
                );
              }

              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-label={label}
                  title={label}
                  className={commonClass}
                  onClick={() => setActiveId(id)}
                  onKeyDown={(e) => onNavKeyDown(e, index)}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </button>
              );
            })}
          </aside>

          <div
            className="mkt-os-mock-panel flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-4"
            role={interactive ? "tabpanel" : undefined}
            aria-live="polite"
          >
            {activeId === "dashboard" ? <MockDashboardView t={t} /> : null}
            {activeId === "crm" ? <MockListView viewId="crm" t={t} /> : null}
            {activeId === "documents" ? <MockListView viewId="documents" t={t} /> : null}
            {activeId === "billing" ? <MockListView viewId="billing" t={t} /> : null}
            {activeId === "analytics" ? <MockListView viewId="analytics" t={t} /> : null}
            {activeId === "settings" ? <MockListView viewId="settings" t={t} /> : null}

            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-2">
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900/30 px-3 py-2 text-xs font-semibold text-slate-400">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden />
                <span>BSD-YBM OS</span>
              </div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                {t("marketingHome.mock.boardKicker")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
