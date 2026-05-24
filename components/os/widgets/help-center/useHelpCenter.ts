"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSyncedWidgetNavigation } from "@/hooks/use-synced-widget-navigation";
import type { WidgetViewState } from "@/lib/workspace-navigation/types";
import { getHelpCenterContent } from "@/lib/help-center/get-content";
import type { HelpGuide } from "@/lib/help-center/types";

export function useHelpCenter(locale: string) {
  const content = useMemo(() => getHelpCenterContent(locale), [locale]);

  const [categoryId, setCategoryId] = useState(content.categories[0]?.id ?? "start");
  const [guideId, setGuideId] = useState<string | null>(content.guides[0]?.id ?? null);
  const [query, setQuery] = useState("");
  const [faqOpen, setFaqOpen] = useState<string | null>(null);

  const applyHelpNav = useCallback((view: WidgetViewState) => {
    if (view.categoryId) setCategoryId(String(view.categoryId));
    if (view.guideId !== undefined) setGuideId(view.guideId ? String(view.guideId) : null);
  }, []);

  const { pushView } = useSyncedWidgetNavigation(applyHelpNav);

  useEffect(() => {
    const firstCategory = content.categories[0]?.id ?? "start";
    const firstGuide =
      content.guides.find((g) => g.categoryId === firstCategory)?.id ?? content.guides[0]?.id ?? null;
    setCategoryId(firstCategory);
    setGuideId(firstGuide);
    setQuery("");
    setFaqOpen(null);
  }, [locale, content]);

  const guidesInCategory = useMemo(
    () => content.guides.filter((g) => g.categoryId === categoryId),
    [content.guides, categoryId],
  );

  const activeGuide: HelpGuide | null =
    content.guides.find((g) => g.id === guideId) ?? guidesInCategory[0] ?? null;

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const guides = content.guides.filter(
      (g) =>
        g.title.toLowerCase().includes(q) ||
        g.summary.toLowerCase().includes(q) ||
        g.steps.some((s) => s.title.toLowerCase().includes(q) || s.body.toLowerCase().includes(q)),
    );
    const faq = content.globalFaq.filter(
      (f) => f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q),
    );
    return { guides, faq };
  }, [query, content]);

  const openGuide = (g: HelpGuide) => {
    setCategoryId(g.categoryId);
    setGuideId(g.id);
    setQuery("");
    pushView({ categoryId: g.categoryId, guideId: g.id });
  };

  return {
    content,
    categoryId, setCategoryId,
    guideId, setGuideId,
    query, setQuery,
    faqOpen, setFaqOpen,
    guidesInCategory, activeGuide, searchResults,
    openGuide, pushView,
  };
}
