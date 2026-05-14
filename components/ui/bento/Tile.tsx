import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export type TileTone = "neutral" | "finance" | "clients" | "ai" | "lavender" | "mint" | "rose" | "sky" | "dark";
export type TileSpan = 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12;
export type TileRows = 1 | 2 | 3;

const toneClass: Record<TileTone, string> = {
  neutral: "",
  finance: "tile--finance",
  clients: "tile--clients",
  ai: "tile--ai",
  lavender: "tile--lavender",
  mint: "tile--mint",
  rose: "tile--rose",
  sky: "tile--sky",
  dark: "tile--dark",
};

const spanClass: Record<TileSpan, string> = {
  3: "tile-span-3",
  4: "tile-span-4",
  5: "tile-span-5",
  6: "tile-span-6",
  7: "tile-span-7",
  8: "tile-span-8",
  9: "tile-span-9",
  12: "tile-span-12",
};

const rowsClass: Record<TileRows, string> = {
  1: "tile-rows-1",
  2: "tile-rows-2",
  3: "tile-rows-3",
};

/**
 * Tile — האריח הבסיסי של Pro Bento. מגיע בגוונים שונים לפי ציר.
 * אפשר להפוך אריח ללינק על ידי מתן `href`.
 */
export function Tile({
  children,
  tone = "neutral",
  span = 4,
  rows = 1,
  href,
  ariaLabel,
  padded = true,
  className,
}: {
  children: ReactNode;
  tone?: TileTone;
  span?: TileSpan;
  rows?: TileRows;
  href?: string;
  ariaLabel?: string;
  padded?: boolean;
  className?: string;
}) {
  const combinedClass = `tile ${toneClass[tone]} ${spanClass[span]} ${rowsClass[rows]} ${href ? "tile-interactive" : ""} ${className ?? ""}`.trim();
  const body = <div className={padded ? "tile-body-lg h-full" : "h-full"}>{children}</div>;
  if (href) {
    return (
      <Link href={href} className={combinedClass} aria-label={ariaLabel}>
        {body}
      </Link>
    );
  }
  return <article className={combinedClass} aria-label={ariaLabel}>{body}</article>;
}

/** Tile header: eyebrow + title + optional action (see-all link) */
export function TileHeader({
  eyebrow,
  title,
  action,
  liveDot,
}: {
  eyebrow?: string;
  title?: string;
  action?: ReactNode;
  liveDot?: boolean;
}) {
  return (
    <header className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="tile-eyebrow">
            {eyebrow}
            {liveDot ? (
              <span className="inline-flex items-center gap-1 ms-1">
                <span className="timeline-dot timeline-dot--live bg-emerald-400 text-emerald-400" aria-hidden />
                <span className="text-[10px] font-bold uppercase tracking-wider">LIVE</span>
              </span>
            ) : null}
          </p>
        ) : null}
        {title ? (
          <h3 className="mt-1 text-base font-black tracking-tight">{title}</h3>
        ) : null}
      </div>
      {action}
    </header>
  );
}

/** See-all link (ship with any tile) */
export function TileLink({
  href,
  label,
  tone = "neutral",
}: {
  href: string;
  label: string;
  tone?: "finance" | "clients" | "ai" | "neutral";
}) {
  const color =
    tone === "finance"
      ? "var(--axis-finance)"
      : tone === "clients"
        ? "var(--axis-clients)"
        : tone === "ai"
          ? "var(--axis-ai)"
          : "var(--ink-700)";
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-[12px] font-bold transition hover:underline"
      style={{ color }}
    >
      {label}
      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
    </Link>
  );
}
