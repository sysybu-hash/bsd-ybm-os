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

export default function HelpCenterWidget({ openWorkspaceWidget }: Props) {
  const { dir } = useI18n();
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
      <header className="shrink-0 border-b border-[color:var(--border-main)] p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/15 text-sky-600">
            <BookOpen size={22} />
          </span>
          <div>
            <h2 className="text-lg font-black">מרכז עזרה</h2>
            <p className="text-xs text-[color:var(--foreground-muted)]">מדריכים, שאלות נפוצות וקיצורי דרך</p>
          </div>
        </div>
        <div className="relative mt-3">
          <Search
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--foreground-muted)]"
            size={16}
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש במדריכים ובשאלות..."
            className="w-full rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/50 py-2.5 pr-10 pl-3 text-sm"
          />
        </div>
      </header>

      {searchResults ? (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {searchResults.guides.length === 0 && searchResults.faq.length === 0 ? (
            <p className="text-sm text-[color:var(--foreground-muted)]">לא נמצאו תוצאות</p>
          ) : null}
          {searchResults.guides.length > 0 ? (
            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-[color:var(--foreground-muted)]">
                מדריכים
              </h3>
              <ul className="space-y-2">
                {searchResults.guides.map((g) => (
                  <li key={g.id}>
                    <button
                      type="button"
                      onClick={() => openGuide(g)}
                      className="w-full rounded-xl border border-[color:var(--border-main)] p-3 text-start hover:bg-[color:var(--surface-soft)]"
                    >
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
                שאלות נפוצות
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
        <div className="flex min-h-0 flex-1">
          <aside className="w-44 shrink-0 overflow-y-auto border-e border-[color:var(--border-main)] p-2">
            {HELP_CENTER_HE.categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setCategoryId(c.id);
                  const first = HELP_CENTER_HE.guides.find((g) => g.categoryId === c.id);
                  setGuideId(first?.id ?? null);
                }}
                className={`mb-1 w-full rounded-lg px-2 py-2 text-start text-xs font-bold transition ${
                  categoryId === c.id
                    ? "bg-sky-600 text-white"
                    : "text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)]"
                }`}
              >
                {c.title}
              </button>
            ))}
          </aside>

          <div className="flex min-w-0 flex-1 flex-col md:flex-row">
            <nav className="max-h-32 overflow-y-auto border-b border-[color:var(--border-main)] p-2 md:max-h-none md:w-52 md:border-b-0 md:border-e">
              {guidesInCategory.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setGuideId(g.id)}
                  className={`mb-1 block w-full rounded-lg px-2 py-2 text-start text-xs font-semibold ${
                    activeGuide?.id === g.id
                      ? "bg-[color:var(--surface-soft)] text-[color:var(--foreground-main)]"
                      : "text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)]"
                  }`}
                >
                  {g.title}
                </button>
              ))}
            </nav>

            <article className="flex-1 overflow-y-auto p-4">
              {activeGuide ? (
                <>
                  <h3 className="text-xl font-black">{activeGuide.title}</h3>
                  <p className="mt-1 text-sm text-[color:var(--foreground-muted)]">{activeGuide.summary}</p>
                  <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-sky-600">
                    זמן קריאה ~{activeGuide.readMinutes} דקות
                  </p>
                  <ol className="mt-4 space-y-4">
                    {activeGuide.steps.map((step, i) => (
                      <li key={i} className="flex gap-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-500/15 text-xs font-black text-sky-700">
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
                      <p className="text-xs font-bold text-amber-800">טיפים</p>
                      <ul className="mt-1 list-disc ps-4 text-sm text-amber-900/90">
                        {activeGuide.tips.map((t, i) => (
                          <li key={i}>{t}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {activeGuide.omnibarExamples?.length ? (
                    <div className="mt-4">
                      <p className="text-xs font-bold">דוגמאות ל-Omnibar</p>
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
                      className="mt-4 flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white"
                    >
                      <ExternalLink size={16} />
                      פתח מסך רלוונטי
                    </button>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-[color:var(--foreground-muted)]">בחרו מדריך מהרשימה</p>
              )}

              <section className="mt-8 border-t border-[color:var(--border-main)] pt-6">
                <h4 className="text-sm font-black">שאלות נפוצות</h4>
                <ul className="mt-3 space-y-2">
                  {HELP_CENTER_HE.globalFaq.map((f, i) => {
                    const key = `faq-${i}`;
                    const open = faqOpen === key;
                    return (
                      <li key={key} className="rounded-xl border border-[color:var(--border-main)]">
                        <button
                          type="button"
                          onClick={() => setFaqOpen(open ? null : key)}
                          className="flex w-full items-center justify-between gap-2 p-3 text-start text-sm font-bold"
                        >
                          {f.question}
                          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                        {open ? (
                          <p className="border-t border-[color:var(--border-main)] px-3 pb-3 text-sm text-[color:var(--foreground-muted)]">
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

      <footer className="shrink-0 border-t border-[color:var(--border-main)] p-3 flex flex-wrap gap-2">
        {openWorkspaceWidget ? (
          <button
            type="button"
            onClick={() =>
              openWorkspaceWidget("aiChatFull", {
                prompt: "יש לי שאלה על השימוש במערכת BSD-YBM",
              })
            }
            className="flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2 text-xs font-bold text-white"
          >
            <MessageCircle size={16} />
            פתח צ׳אט AI
          </button>
        ) : null}
        <Link
          href="/help"
          className="flex items-center gap-2 rounded-xl border border-[color:var(--border-main)] px-4 py-2 text-xs font-bold"
        >
          <Sparkles size={16} />
          דף עזרה מלא
        </Link>
      </footer>
    </div>
  );
}
