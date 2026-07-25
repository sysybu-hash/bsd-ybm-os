import type { Metadata } from "next";
import { getCanonicalSiteUrl } from "@/lib/site-metadata";
import SolutionsPageClient from "./SolutionsPageClient";

export const metadata: Metadata = {
  title: "פתרונות לפי ענף — BSD-YBM OS",
  description: "BSD-YBM OS מותאמת לקבלנים, חברות ניהול, נותני שירותים ועוד — מודולרית לפי תחום העסק.",
  alternates: { canonical: `${getCanonicalSiteUrl()}/solutions` },
  openGraph: {
    type: "website",
    title: "פתרונות לפי ענף — BSD-YBM OS",
    description: "מערכת תפעול מודולרית שמותאמת לענף שלכם.",
    url: `${getCanonicalSiteUrl()}/solutions`,
  },
};

export default function SolutionsPage() {
  return <SolutionsPageClient />;
}
