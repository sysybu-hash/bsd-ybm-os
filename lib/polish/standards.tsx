"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { POLISH_PREMIUM_INTERACTIVE, POLISH_PREMIUM_STATIC, POLISH_PAGE_TITLE, POLISH_SECTION_TITLE } from "@/lib/polish/premium-tokens";

/** @deprecated — השתמשו ב־`POLISH_PREMIUM_INTERACTIVE` מ־`premium-tokens` */
export const POLISH_PREMIUM_CARD_CLASS = POLISH_PREMIUM_INTERACTIVE;

/** כותרות עקביות בתוך דפים */
export const POLISH_HEADING = {
  h1: POLISH_PAGE_TITLE,
  h2: POLISH_SECTION_TITLE,
  body: "text-sm text-slate-600",
} as const;

type PageWrapperProps = {
  children: ReactNode;
  className?: string;
};

/**
 * עטיפת מעבר לדפים — לא מזיזה position:fixed בתוך ילדים (מומלץ לעטוף תוכן עיקרי בלבד).
 */
export function PageWrapper({ children, className = "" }: PageWrapperProps) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

type TableSkeletonProps = {
  rows?: number;
  columns?: number;
  className?: string;
};

/** מצב טעינה לטבלאות / רשימות נתונים */
export function TableSkeleton({ rows = 6, columns = 4, className = "" }: TableSkeletonProps) {
  return (
    <div
      className={`${POLISH_PREMIUM_STATIC} p-6 ${className}`}
      aria-busy
      aria-live="polite"
    >
      <div className="mb-4 h-8 max-w-xs animate-pulse rounded-lg bg-slate-100" />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <div key={rowIdx} className="flex gap-3">
            {Array.from({ length: columns }).map((_, ci) => (
              <div key={ci} className="h-10 flex-1 animate-pulse rounded-lg bg-slate-100" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

type PolishedPageSurfaceProps = {
  children: ReactNode;
  className?: string;
  padded?: boolean;
};

/** מעטפת תוכן דף עם סטנדרט הכרטיס — לשימוש ישיר מתחת ל־PageWrapper */
export function PolishedPageSurface({ children, className = "", padded = true }: PolishedPageSurfaceProps) {
  return (
    <div className={`${POLISH_PREMIUM_INTERACTIVE} ${padded ? "p-6 md:p-8" : ""} ${className}`}>
      {children}
    </div>
  );
}
