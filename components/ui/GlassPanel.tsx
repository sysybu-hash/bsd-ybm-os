import type { ReactNode } from "react";

type Props = Readonly<{
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article";
}>;

/** פאנל זכוכית 2026 — רקע מטושטש, מסגרת מבריקה */
export default function GlassPanel({ children, className = "", as: Tag = "div" }: Props) {
  return <Tag className={`glass-2026-panel ${className}`.trim()}>{children}</Tag>;
}
