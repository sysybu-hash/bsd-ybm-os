"use client";

import { useState } from "react";
import { BookOpen, Box, Check, Download, Link2 } from "lucide-react";
import { VmbLink } from "@/components/vmb/VmbLink";
import type { ProjectBooklet } from "@/lib/vmb/outcome";

export type BookletLabels = {
  title: string;
  /** {date} */
  ready: string;
  open: string;
  download: string;
  share: string;
  copied: string;
  /** {painted}, {free} */
  pictures: string;
  /** {n} */
  credits: string;
  free: string;
  assumptionsTitle: string;
  assumptionsNone: string;
  unusedTitle: string;
  answers: Record<string, string>;
  /** {date} */
  filesDeleteOn: string;
  /** {date} */
  filesDeleted: string;
  studio: string;
};

/**
 * Step 7: the booklet the run delivered — open, download, copy its link — with the assumptions page next to it (rule
 * 13.2): every value the engine took as given, and the answers that did not change this booklet.
 */
export function BookletCard({ booklet, files, studioHref, labels }: { booklet: ProjectBooklet; files: { deleteAt: string | null; deletedAt: string | null }; studioHref?: string; labels: BookletLabels }) {
  const [copied, setCopied] = useState(false);
  const day = (iso: string) => new Date(iso).toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" });
  const date = day(booklet.at);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(booklet.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* no clipboard (insecure context): the open link is still there */
    }
  };

  const btn = "flex items-center gap-1.5 rounded-full border border-[color:var(--vmb-line-strong)] px-4 py-1.5 text-xs font-semibold hover:border-[color:var(--vmb-accent)]";
  return (
    <section className="vmb-card p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[color:var(--vmb-accent-soft)] text-[color:var(--vmb-accent)]">
          <BookOpen className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold">{labels.title}</h2>
          <p className="mt-0.5 text-xs text-[color:var(--vmb-ink-soft)]">{labels.ready.replace("{date}", date)}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <a href={booklet.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-full bg-[color:var(--vmb-accent)] px-4 py-1.5 text-xs font-bold text-[color:var(--vmb-accent-ink)]">
          <BookOpen className="h-3.5 w-3.5" aria-hidden />
          {labels.open}
        </a>
        <a href={booklet.url} download className={btn}>
          <Download className="h-3.5 w-3.5" aria-hidden />
          {labels.download}
        </a>
        <button type="button" onClick={() => void copy()} className={btn}>
          {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Link2 className="h-3.5 w-3.5" aria-hidden />}
          {copied ? labels.copied : labels.share}
        </button>
        {booklet.studio && studioHref ? (
          <VmbLink href={studioHref} className={btn}>
            <Box className="h-3.5 w-3.5" aria-hidden />
            {labels.studio}
          </VmbLink>
        ) : null}
      </div>

      <p className="mt-3 text-xs text-[color:var(--vmb-ink-soft)]">
        {labels.pictures.replace("{painted}", String(booklet.picturesPainted)).replace("{free}", String(booklet.picturesFree))} ·{" "}
        {booklet.creditsUsed > 0 ? labels.credits.replace("{n}", String(booklet.creditsUsed)) : labels.free}
      </p>
      {files.deletedAt || files.deleteAt ? (
        <p className="mt-1 text-xs text-[color:var(--vmb-muted)]">
          {files.deletedAt ? labels.filesDeleted.replace("{date}", day(files.deletedAt)) : labels.filesDeleteOn.replace("{date}", day(files.deleteAt!))}
        </p>
      ) : null}

      <div className="mt-4 rounded-xl bg-[color:var(--vmb-bg-sunk)] p-3">
        <h3 className="text-xs font-bold">{labels.assumptionsTitle}</h3>
        {booklet.assumptions.length ? (
          <ul className="mt-2 list-disc space-y-1 ps-4 text-xs text-[color:var(--vmb-ink-soft)]">
            {booklet.assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-[color:var(--vmb-muted)]">{labels.assumptionsNone}</p>
        )}
        {booklet.unusedAnswers.length ? (
          <p className="mt-3 text-xs text-[color:var(--vmb-muted)]">
            {labels.unusedTitle} {booklet.unusedAnswers.map((id) => labels.answers[id] ?? id).join(", ")}
          </p>
        ) : null}
      </div>
    </section>
  );
}
