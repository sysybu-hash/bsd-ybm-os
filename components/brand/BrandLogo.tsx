import Image from "next/image";
import {
  BRAND_LOGO_ALT,
  BRAND_LOGO_DAY_SRC,
  BRAND_LOGO_NIGHT_SRC,
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

/** רוחב מקסימלי לתצוגה (יחס המקור ~560×387 נשמר ב-next/image) */
const IMAGE_MAX_W: Record<keyof typeof LOCKUP, number> = {
  xs: 56,
  sm: 80,
  md: 128,
  lg: 168,
  xl: 208,
  hero: 340,
};

/** ריווח פנימי כדי שה-PNG לא ייגזם בקצוות */
const IMAGE_BOX_PAD_PX = 4;

/** יחס תצוגה אחיד (מסונכרן עם prepare-brand-assets.mjs — גובה/רוחב קנבס) */
const IMAGE_CANVAS = { width: 560, height: 387 } as const;
const IMAGE_ASPECT = IMAGE_CANVAS.height / IMAGE_CANVAS.width;

/** גובה מקסימלי לפי רוחב (כולל ריווח פנימי) — יום ולילה באותו מלבן */
function imageBoxStyle(maxW: number) {
  const innerW = Math.max(1, maxW - IMAGE_BOX_PAD_PX * 2);
  const innerH = Math.round(innerW * IMAGE_ASPECT);
  const outerH = innerH + IMAGE_BOX_PAD_PX * 2;
  return {
    width: maxW,
    height: outerH,
    maxWidth: maxW,
    maxHeight: outerH,
  } as const;
}


const TILE_SURFACE =
  "bg-white shadow-[0_4px_24px_-4px_rgba(15,23,42,0.12),0_1px_3px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/90 " +
  "dark:bg-[color:var(--surface-card)] dark:shadow-[0_4px_24px_-8px_rgba(0,0,0,0.45)] dark:ring-white/10";

const MARK_GRADIENT =
  "bg-gradient-to-br from-indigo-600 via-indigo-500 to-cyan-600 bg-clip-text text-transparent " +
  "dark:from-indigo-300 dark:via-indigo-200 dark:to-cyan-300";

export type BrandLogoSize = keyof typeof LOCKUP;
export type BrandLogoVariant = "lockup" | "image";
/** auto = יום/לילה לפי ערכת נושא; night = לוגו כהה (אפליקציה) */
export type BrandLogoTone = "auto" | "day" | "night";

type BrandLogoProps = {
  size?: BrandLogoSize;
  variant?: BrandLogoVariant;
  /** auto = יום/לילה לפי ערכת נושא (ברירת מחדל) */
  tone?: BrandLogoTone;
  className?: string;
  priority?: boolean;
  showIcon?: boolean;
  /** מסגרת בהירה מעוצבת סביב BY + bsd-ybm (רק lockup) */
  tile?: boolean;
  subtitle?: string;
  /** במובייל — כותרת משנה מתחת ללוגו (לא ליד) */
  subtitleBelowOnMobile?: boolean;
};

const IMAGE_FIT =
  "max-h-full max-w-full object-contain object-center";

/** זוהר עדין ללוגו לילה — רק במצב כהה (צל בהיר יצר פס/זוהר בצד המסך) */
const NIGHT_GLOW = "dark:drop-shadow-[0_0_20px_rgba(56,189,248,0.07)]";

function BrandLogoImage({
  size,
  tone,
  priority,
  className,
}: {
  size: BrandLogoSize;
  tone: BrandLogoTone;
  priority?: boolean;
  className?: string;
}) {
  const maxW = IMAGE_MAX_W[size];
  const box = imageBoxStyle(maxW);
  const intrinsic = IMAGE_CANVAS;
  const showNightGlow = tone === "night" || tone === "auto";
  const nightGlowClass = showNightGlow ? NIGHT_GLOW : "";

  const imageCommon = {
    "aria-hidden": true as const,
    width: intrinsic.width,
    height: intrinsic.height,
    priority,
    sizes: `${maxW}px`,
  };

  return (
    <span
      role="img"
      aria-label={BRAND_LOGO_ALT}
      className={`box-border inline-flex shrink-0 items-center justify-center p-1 leading-none ${className ?? ""}`.trim()}
      style={box}
    >
      {tone === "night" ? (
        <Image
          src={BRAND_LOGO_NIGHT_SRC}
          alt=""
          {...imageCommon}
          className={`block ${IMAGE_FIT} ${nightGlowClass}`.trim()}
        />
      ) : null}
      {tone === "day" ? (
        <Image
          src={BRAND_LOGO_DAY_SRC}
          alt=""
          {...imageCommon}
          className={`block ${IMAGE_FIT}`.trim()}
        />
      ) : null}
      {tone === "auto" ? (
        <>
          <Image
            src={BRAND_LOGO_DAY_SRC}
            alt=""
            {...imageCommon}
            className={`block ${IMAGE_FIT} dark:hidden`.trim()}
          />
          <Image
            src={BRAND_LOGO_NIGHT_SRC}
            alt=""
            {...imageCommon}
            className={`hidden ${IMAGE_FIT} ${nightGlowClass} dark:block`.trim()}
          />
        </>
      ) : null}
    </span>
  );
}

export default function BrandLogo({
  size = "md",
  variant = "lockup",
  tone = "auto",
  className = "",
  priority,
  showIcon = false,
  tile = true,
  subtitle,
  subtitleBelowOnMobile = false,
}: BrandLogoProps) {
  const scale = LOCKUP[size];

  const subtitleLayoutClass = subtitle
    ? subtitleBelowOnMobile
      ? "max-md:flex-col max-md:items-center max-md:gap-0.5 md:flex-row md:items-center md:gap-2"
      : "flex-row items-center gap-2"
    : "flex-col gap-1.5";

  const subtitleTextClass = (base: string) =>
    subtitleBelowOnMobile
      ? `${base} max-md:max-w-none max-md:text-center max-md:text-[9px] max-md:font-semibold md:truncate md:max-w-[8rem]`
      : `${base} min-w-0 max-w-[6.5rem] truncate sm:max-w-[8rem]`;

  if (variant === "image") {
    const subtitleSize =
      size === "hero"
        ? "text-sm"
        : size === "lg" || size === "xl"
          ? "text-xs"
          : "text-[10px] sm:text-[11px]";

    return (
      <div
        className={`inline-flex min-w-0 ${subtitleLayoutClass} ${className}`.trim()}
        aria-label={subtitle ? undefined : BRAND_LOGO_ALT}
      >
        <BrandLogoImage size={size} tone={tone} priority={priority} />
        {subtitle ? (
          <span
            className={subtitleTextClass(
              `font-medium leading-tight text-slate-600 dark:text-[color:var(--foreground-muted)] ${subtitleSize}`,
            )}
          >
            {subtitle}
          </span>
        ) : null}
      </div>
    );
  }

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
      className={`inline-flex min-w-0 ${subtitleLayoutClass} ${className}`.trim()}
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
          className={subtitleTextClass(
            `font-medium leading-tight text-slate-600 dark:text-[color:var(--foreground-muted)] ${subtitleSize}`,
          )}
        >
          {subtitle}
        </span>
      ) : null}
    </div>
  );
}
