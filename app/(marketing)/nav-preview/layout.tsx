import type { Metadata } from "next";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "BSD-YBM OS — תצוגת תפריט צידי",
  description: "תצוגה מקדימה: דף הנחיתה עם תפריט צידי נפתח (מגירה).",
  robots: { index: false, follow: false },
};

export default function NavPreviewLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
