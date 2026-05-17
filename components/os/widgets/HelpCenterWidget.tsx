"use client";

import React, { useMemo, useState } from "react";
import { BookOpen, ChevronDown, ChevronUp, ExternalLink, MessageCircle, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import type { WidgetType } from "@/hooks/use-window-manager";
import { HELP_CENTER_HE } from "@/lib/help-center/content.he";
import type { HelpGuide } from "@/lib/help-center/types";
import { useI18n } from "@/components/os/system/I18nProvider";

type Props = {
  openWorkspaceWidget?: (type: WidgetType, data?: Record<string, unknown> | null) => void;
};

const categoryBtnClass = (active: boolean) =>
  `rounded-xl font-bold transition max-md:min-h-[44px] max-md:shrink-0 max-md:whitespace-nowrap max-md:px-4 max-md:py-2.5 max-md:text-sm md:mb-1 md:w-full md:rounded-lg md:px-3 md:py-2.5 md:text-xs ${
    active
      ? "bg-sky-600 text-white"
      : "text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)]"
  }`;

const guideBtnClass = (active: boolean) =>
  `rounded-xl text-start font-semibold transition max-md:min-h-[44px] max-md:shrink-0 max-md:whitespace-nowrap max-md:px-4 max-md:py-3 max-md:text-sm md:mb-1 md:block md:w-full md:rounded-lg md:px-3 md:py-2.5 md:text-xs ${
    active
      ? "bg-[color:var(--surface-soft)] text-[color:var(--foreground-main)]"
      : "text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)]"
  }`;

const resultCardClass =
  "w-full min-h-[44px] rounded-xl border border-[color:var(--border-main)] p-3 text-start hover:bg-[color:var(--surface-soft)] active:bg-[color:var(--surface-soft)]";

export default function HelpCenterWidget({ openWorkspaceWidget }: Props) {
  const { t, dir } = useI18n();
  const [categoryId, setCategoryId] = useState(HELP_CENTER_HE.categories[0]?.id ?? "start");
  const [guideId, setGuideId] = useState<string | null>(HELP_CENTER_HE.guides[0]?.id ?? null);
  const [query, setQuery] = useState("");
  const [faqOpen, setFaqOpen] = useState<string | null>(null);

  const guidesInCategory = useMemo(
    () => HELP_CENTER_HE.guides.filter((g) => g.categoryId === categoryId),
    [categoryId],
  );

  const activeGuide: HelpGuide | null =
    HELP_CENTER_HE.guides.find((g) => g.id === guideId) ??
    guidesInCategory[0] ??
    null;

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const guides = HELP_CENTER_HE.guides.filter(
      (g) =>
        g.title.toLowerCase().includes(q) ||
        g.summary.toLowerCase().includes(q) ||
        g.steps.some((s) => s.title.toLowerCase().includes(q) || s.body.toLowerCase().includes(q)),
    );
    const faq = HELP_CENTER_HE.globalFaq.filter(
      (f) => f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q),
    );
    return { guides, faq };
  }, [query]);

  const openGuide = (g: HelpGuide) => {
    setCategoryId(g.categoryId);
    setGuideId(g.id);
    setQuery("");
  };

  return (
    <div className="flex h-full flex-col bg-[color:var(--background-main)] text-[color:var(--foreground-main)]" dir={dir}>
      <header className="shrink-0 border-b border-[color:var(--border-main)] p-4 max-md:px-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 text-sky-600">
            <BookOpen size={22} aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-black">{t("workspaceWidgets.helpCenter.title")}</h2>
            <p className="text-sm text-[color:var(--foreground-muted)] md:text-xs">
              {t("workspaceWidgets.helpCenter.subtitle")}
            </p>
          </div>
        </div>
        <div className="relative mt-3">
          <Search
            className="pointer-events-none absolute inset-inline-start-3 top-1/2 -translate-y-1/2 text-[color:var(--foreground-muted)]"
            size={18}
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("workspaceWidgets.helpCenter.searchPlaceholder")}
            className="w-full min-h-[44px] rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/50 py-3 ps-11 pe-3 text-base text-[color:var(--foreground-main)] placeholder:text-[color:var(--foreground-muted)] md:text-sm"
          />
        </div>
      </header>

      {searchResults ? (
        <div className="flex-1 space-y-4 overflow-y-auto p-4 max-md:px-3">
          {searchResults.guides.length === 0 && searchResults.faq.length === 0 ? (
            <p className="text-sm text-[color:var(--foreground-muted)]">{t("workspaceWidgets.helpCenter.noResults")}</p>
          ) : null}
          {searchResults.guides.length > 0 ? (
            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-[color:var(--foreground-muted)]">
                {t("workspaceWidgets.helpCenter.guidesSection")}
              </h3>
              <ul className="space-y-2">
                {searchResults.guides.map((g) => (
                  <li key={g.id}>
                    <button type="button" onClick={() => openGuide(g)} className={resultCardClass}>
                      <p className="font-bold text-sm">{g.title}</p>
                      <p className="text-xs text-[color:var(--foreground-muted)]">{g.summary}</p>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {searchResults.faq.length > 0 ? (
            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-[color:var(--foreground-muted)]">
                {t("workspaceWidgets.helpCenter.faqSection")}
              </h3>
              <ul className="space-y-2">
                {searchResults.faq.map((f, i) => (
                  <li key={i} className="rounded-xl border border-[color:var(--border-main)] p-3 text-sm">
                    <p className="font-bold">{f.question}</p>
                    <p className="mt-1 text-[color:var(--foreground-muted)]">{f.answer}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <aside className="shrink-0 border-b border-[color:var(--border-main)] max-md:overflow-x-auto max-md:px-2 max-md:py-3 md:w-48 md:overflow-y-auto md:border-e md:border-b-0 md:p-2">
            <div
              className="flex gap-2 max-md:flex-row md:flex-col"
              role="tablist"
              aria-label={t("workspaceWidgets.helpCenter.guidesSection")}
            >
              {HELP_CENTER_HE.categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={categoryId === c.id}
                  onClick={() => {
                    setCategoryId(c.id);
                    const first = HELP_CENTER_HE.guides.find((g) => g.categoryId === c.id);
                    setGuideId(first?.id ?? null);
                  }}
                  className={categoryBtnClass(categoryId === c.id)}
                >
                  {c.title}
                </button>
              ))}
            </div>
          </aside>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col md:flex-row">
            <nav className="shrink-0 border-b border-[color:var(--border-main)] max-md:overflow-x-auto max-md:px-2 max-md:py-3 md:w-56 md:overflow-y-auto md:border-e md:border-b-0 md:p-2">
              <div className="flex gap-2 max-md:flex-row md:flex-col">
                {guidesInCategory.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setGuideId(g.id)}
                    className={guideBtnClass(activeGuide?.id === g.id)}
                  >
                    {g.title}
                  </button>
                ))}
              </div>
            </nav>

            <article className="min-h-0 flex-1 overflow-y-auto p-4 max-md:px-3 md:p-4">
              {activeGuide ? (
                <>
                  <h3 className="text-xl font-black leading-snug">{activeGuide.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-[color:var(--foreground-muted)]">{activeGuide.summary}</p>
                  <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-sky-600">
                    {t("workspaceWidgets.helpCenter.readMinutes", {
                      minutes: String(activeGuide.readMinutes),
                    })}
                  </p>
                  <ol className="mt-4 space-y-4">
                    {activeGuide.steps.map((step, i) => (
                      <li key={i} className="flex gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-500/15 text-xs font-black text-sky-700">
                          {i + 1}
                        </span>
                        <div>
                          <p className="font-bold text-sm">{step.title}</p>
                          <p className="mt-1 text-sm leading-relaxed text-[color:var(--foreground-muted)]">
                            {step.body}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                  {activeGuide.tips?.length ? (
                    <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                      <p className="text-xs font-bold text-amber-800">{t("workspaceWidgets.helpCenter.tips")}</p>
                      <ul className="mt-1 list-disc ps-4 text-sm text-amber-900/90">
                        {activeGuide.tips.map((tip, i) => (
                          <li key={i}>{tip}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {activeGuide.omnibarExamples?.length ? (
                    <div className="mt-4">
                      <p className="text-xs font-bold">{t("workspaceWidgets.helpCenter.omnibarExamples")}</p>
                      <ul className="mt-2 flex flex-wrap gap-2">
                        {activeGuide.omnibarExamples.map((ex) => (
                          <li
                            key={ex}
                            className="rounded-lg bg-[color:var(--surface-soft)] px-2 py-1 font-mono text-[11px]"
                          >
                            {ex}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {activeGuide.openWidget && openWorkspaceWidget ? (
                    <button
                      type="button"
                      onClick={() => openWorkspaceWidget(activeGuide.openWidget!)}
                      className="mt-4 flex min-h-[44px] items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white"
                    >
                      <ExternalLink size={16} aria-hidden />
                      {t("workspaceWidgets.helpCenter.openRelevantScreen")}
                    </button>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-[color:var(--foreground-muted)]">{t("workspaceWidgets.helpCenter.selectGuide")}</p>
              )}

              <section className="mt-8 border-t border-[color:var(--border-main)] pt-6">
                <h4 className="text-sm font-black">{t("workspaceWidgets.helpCenter.globalFaqTitle")}</h4>
                <ul className="mt-3 space-y-2">
                  {HELP_CENTER_HE.globalFaq.map((f, i) => {
                    const key = `faq-${i}`;
                    const open = faqOpen === key;
                    return (
                      <li key={key} className="rounded-xl border border-[color:var(--border-main)]">
                        <button
                          type="button"
                          onClick={() => setFaqOpen(open ? null : key)}
                          className="flex min-h-[44px] w-full items-center justify-between gap-2 p-3 text-start text-sm font-bold"
                        >
                          <span className="min-w-0 flex-1">{f.question}</span>
                          {open ? <ChevronUp size={18} aria-hidden /> : <ChevronDown size={18} aria-hidden />}
                        </button>
                        {open ? (
                          <p className="border-t border-[color:var(--border-main)] px-3 pb-3 text-sm leading-relaxed text-[color:var(--foreground-muted)]">
                            {f.answer}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            </article>
          </div>
        </div>
      )}

      <footer className="flex shrink-0 flex-wrap gap-2 border-t border-[color:var(--border-main)] p-3 max-md:px-3">
        {openWorkspaceWidget ? (
          <button
            type="button"
            onClick={() =>
              openWorkspaceWidget("aiChatFull", {
                prompt: t("workspaceWidgets.helpCenter.aiChatPrompt"),
              })
            }
            className="flex min-h-[44px] items-center gap-2 rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-bold text-white md:text-xs"
          >
            <MessageCircle size={16} aria-hidden />
            {t("workspaceWidgets.helpCenter.openAiChat")}
          </button>
        ) : null}
        <Link
          href="/help"
          className="flex min-h-[44px] items-center gap-2 rounded-xl border border-[color:var(--border-main)] px-4 py-2.5 text-sm font-bold md:text-xs"
        >
          <Sparkles size={16} aria-hidden />
          {t("workspaceWidgets.helpCenter.fullHelpPage")}
        </Link>
      </footer>
    </div>
  );
}
