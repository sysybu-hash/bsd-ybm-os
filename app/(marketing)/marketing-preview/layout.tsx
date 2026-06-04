import type { Metadata } from "next";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "BSD-YBM OS — תצוגה מקדימה",
  description:
    "תצוגה מקדימה של דף השיווק הקולנועי — מערכת תפעול חכמה לעסקים מקצועיים.",
  robots: { index: false, follow: false },
};

export default function MarketingPreviewLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
