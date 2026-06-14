import type { Metadata } from "next";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "BSD-YBM OS — דף נחיתה חדש (תצוגה מקדימה)",
  description: "תצוגה מקדימה של דף הנחיתה המעוצב מחדש — מערכת ההפעלה העסקית לקבלנות ולשטח.",
  robots: { index: false, follow: false },
};

export default function RedesignPreviewLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
