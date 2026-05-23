"use client";

import React from "react";
import { FileText } from "lucide-react";
import type { ArchiveFileCategory, ArchiveView } from "./types";

export function categoryIconWrap(category: ArchiveFileCategory): string {
  switch (category) {
    case "invoice":
      return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
    case "quote":
      return "bg-blue-500/10 text-blue-600 dark:text-blue-400";
    case "contract":
      return "bg-purple-500/10 text-purple-600 dark:text-purple-400";
    case "SIGNED_QUOTE":
      return "bg-emerald-500/20 text-emerald-600 dark:text-emerald-300";
    default:
      return "bg-[color:var(--foreground-muted)]/10 text-[color:var(--foreground-muted)]";
  }
}

export function CategoryGlyph({ category }: { category: ArchiveFileCategory }) {
  const wrap = categoryIconWrap(category);
  return (
    <div className={`flex shrink-0 items-center justify-center rounded-lg p-2 ${wrap}`}>
      <FileText size={16} aria-hidden />
    </div>
  );
}

export function categoryChipLabel(cat: ArchiveFileCategory | "all"): string {
  switch (cat) {
    case "all": return "הכל";
    case "invoice": return "חשבוניות";
    case "quote": return "הצעות";
    case "contract": return "חוזים";
    case "SIGNED_QUOTE": return "חתומים";
    case "other": return "אחר";
    default: return cat;
  }
}

export function buildArchiveQuery(params: {
  q: string;
  category: ArchiveFileCategory | "all";
  recentOnly: boolean;
  projectId: string | null;
  view: ArchiveView;
}): string {
  const sp = new URLSearchParams();
  const q = params.q.trim();
  if (q) sp.set("q", q);
  if (params.category !== "all") sp.set("type", params.category);
  if (params.recentOnly) sp.set("recent", "1");
  if (params.projectId) sp.set("projectId", params.projectId);
  if (params.view !== "active") sp.set("view", params.view);
  const s = sp.toString();
  return s ? `?${s}` : "";
}
