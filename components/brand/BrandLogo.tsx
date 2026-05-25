import Image from "next/image";
import {
  BRAND_LOGO_ALT,
  BRAND_LOGO_SRC,
  BRAND_MARK,
  BRAND_WORDMARK,
} from "@/lib/brand";

const LOCKUP = {
  xs: {
    mark: "text-sm",
    word: "text-[7px]",
    gap: "gap-0.5",
    tile: "px-2 py-1 rounded-lg",
  },
  sm: {
    mark: "text-base",
    word: "text-[8px]",
    gap: "gap-0.5",
    tile: "px-2.5 py-1.5 rounded-lg",
  },
  md: {
    mark: "text-xl",
    word: "text-[10px]",
    gap: "gap-1",
    tile: "px-3 py-2 rounded-xl",
  },
  lg: {
    mark: "text-2xl",
    word: "text-[11px]",
    gap: "gap-1",
    tile: "px-3.5 py-2.5 rounded-xl",
  },
  xl: {
    mark: "text-3xl",
    word: "text-xs",
    gap: "gap-1",
    tile: "px-4 py-3 rounded-xl",
  },
  hero: {
    mark: "text-5xl sm:text-6xl",
    word: "text-sm sm:text-base",
    gap: "gap-1.5",
    tile: "px-6 py-5 rounded-2xl",
  },
} as const;

const TILE_SURFACE =
  "bg-white shadow-[0_4px_24px_-4px_rgba(15,23,42,0.12),0_1px_3px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/90 " +
  "dark:bg-[color:var(--surface-card)] dark:shadow-[0_4px_24px_-8px_rgba(0,0,0,0.45)] dark:ring-white/10";

const MARK_GRADIENT =
  "bg-gradient-to-br from-indigo-600 via-indigo-500 to-cyan-600 bg-clip-text text-transparent " +
  "dark:from-indigo-300 dark:via-indigo-200 dark:to-cyan-300";

export type BrandLogoSize = keyof typeof LOCKUP;

type BrandLogoProps = {
  size?: BrandLogoSize;
  className?: string;
  priority?: boolean;
  showIcon?: boolean;
  /** מסגרת בהירה מעוצבת סביב BY + bsd-ybm */
  tile?: boolean;
  subtitle?: string;
};

export default function BrandLogo({
  size = "md",
  className = "",
  priority,
  showIcon = false,
  tile = true,
  subtitle,
}: BrandLogoProps) {
  const scale = LOCKUP[size];

  const lockup = (
    <div className={`flex flex-col items-center leading-none ${scale.gap}`}>
      <span className={`font-black tracking-[-0.04em] ${MARK_GRADIENT} ${scale.mark}`}>
        {BRAND_MARK}
      </span>
      <span
        className={`h-px w-[1.35em] max-w-[3.25rem] bg-gradient-to-r from-indigo-500/70 via-cyan-500/50 to-transparent dark:from-indigo-400/80 dark:via-cyan-400/40`}
        aria-hidden
      />
      <span
        className={`font-medium lowercase tracking-[0.12em] text-slate-500 dark:text-[color:var(--foreground-muted)] ${scale.word}`}
      >
        {BRAND_WORDMARK}
      </span>
    </div>
  );

  const subtitleSize =
    size === "hero"
      ? "text-sm"
      : size === "lg" || size === "xl"
        ? "text-xs"
        : "text-[10px] sm:text-[11px]";

  return (
    <div
      className={`inline-flex min-w-0 items-center gap-2 ${
        subtitle ? "flex-row" : "flex-col gap-1.5"
      } ${className}`.trim()}
      aria-label={BRAND_LOGO_ALT}
    >
      {showIcon ? (
        <Image
          src={BRAND_LOGO_SRC}
          alt=""
          aria-hidden
          width={40}
          height={40}
          priority={priority}
          className="shrink-0 rounded-xl object-cover ring-1 ring-slate-200/80"
        />
      ) : null}
      {tile ? (
        <div className={`shrink-0 ${TILE_SURFACE} ${scale.tile}`}>{lockup}</div>
      ) : (
        lockup
      )}
      {subtitle ? (
        <span
          className={`min-w-0 max-w-[6.5rem] truncate font-medium leading-tight text-slate-600 dark:text-[color:var(--foreground-muted)] sm:max-w-[8rem] ${subtitleSize}`}
        >
          {subtitle}
        </span>
      ) : null}
    </div>
  );
}
