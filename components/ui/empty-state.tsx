"use client";

import { motion } from "framer-motion";
import { FileText, Globe, ImageIcon, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  POLISH_EMPTY_TITLE,
  POLISH_PAGE_SUBTITLE,
  POLISH_PREMIUM_INTERACTIVE,
} from "@/lib/polish/premium-tokens";

export type EmptyStateVariant = "default" | "card" | "bare";
export type EmptyStateIconName = "file" | "globe" | "image" | "users";

const ICONS: Record<EmptyStateIconName, LucideIcon> = {
  file: FileText,
  globe: Globe,
  image: ImageIcon,
  users: Users,
};

export type EmptyStateProps = {
  variant?: EmptyStateVariant;
  icon?: LucideIcon;
  iconName?: EmptyStateIconName;
  title: string;
  description?: string;
  /** @deprecated — השתמשו ב־`description` */
  body?: string;
  action?: ReactNode;
  className?: string;
};

function shellClass(variant: EmptyStateVariant): string {
  switch (variant) {
    case "bare":
      return "flex flex-col items-center justify-center gap-2 px-4 py-8 text-center";
    case "card":
      return `${POLISH_PREMIUM_INTERACTIVE} flex flex-col items-center justify-center gap-4 px-6 py-14 text-center`;
    case "default":
    default:
      return `${POLISH_PREMIUM_INTERACTIVE} flex flex-col items-center gap-3 border-dashed border-slate-200/80 px-6 py-10 text-center`;
  }
}

/**
 * מצב ריק מאוחד — דפים (`default`), כרטיס (`card`) או וידג׳ט בתוך אריח (`bare`).
 */
export function EmptyState({
  variant = "default",
  icon: Icon,
  iconName,
  title,
  description,
  body,
  action,
  className = "",
}: EmptyStateProps) {
  const desc = description ?? body;
  const ResolvedIcon = Icon ?? (iconName ? ICONS[iconName] : undefined);

  return (
    <motion.div
      className={`${shellClass(variant)} ${className}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
    >
      {ResolvedIcon ? (
        <span
          className={`flex items-center justify-center rounded-2xl bg-slate-50 text-slate-400 ${
            variant === "bare" ? "h-12 w-12" : "h-14 w-14"
          }`}
        >
          <ResolvedIcon className={variant === "bare" ? "h-6 w-6" : "h-7 w-7"} strokeWidth={1.5} aria-hidden />
        </span>
      ) : null}
      <p className={`${POLISH_EMPTY_TITLE} max-w-md`}>{title}</p>
      {desc ? <p className={`max-w-md leading-relaxed ${POLISH_PAGE_SUBTITLE}`}>{desc}</p> : null}
      {action ? <div>{action}</div> : null}
    </motion.div>
  );
}
