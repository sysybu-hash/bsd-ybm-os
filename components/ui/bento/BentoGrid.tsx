import type { ReactNode } from "react";

/**
 * BentoGrid — רשת של 12 טורים לאריחי ה-Pro Bento.
 * שימוש: עוטף אוסף של <Tile span={...}> עם ערכי טורים 3/4/6/8/12.
 */
export function BentoGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`bento-grid ${className ?? ""}`}>{children}</div>;
}
